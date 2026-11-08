"""GitHub's rows in Envision Retry Job: the writes every sync flow shares (docs/adr/0008).

A row is named by its ``job_key``, one row per target, so the insert races are
settled by the primary key. Upserting never changes ``status``: anything merged
while the cron runs a row is still in its delta when the cron looks again.

Each direction has its own upsert over ``upsert_row``. The cron owns a row while
it runs one: a handler in cron mode never calls these for its own row.
"""

import json
from datetime import datetime

import frappe
from frappe.utils import now_datetime

from setu.github import connection, delta, projects, store
from setu.github.client import GitHubError
from setu.github.delta import Direction
from setu.retry_jobs import PENDING

INTEGRATION = "GitHub"
FAILURE_TITLE = "GitHub sync failed"
# A row can only vanish between the two steps when the cron empties it, so a
# second pass all but settles it.
UPSERT_PASSES = 3


def merge_into_row(job_key: str, entries: dict[str, str], error_log: str | None) -> bool:
	"""Merge into the row under its lock, or False when there is no row. Checked
	without a lock first, because locking a missing key takes a gap lock that
	deadlocks two concurrent inserts."""
	if not frappe.db.exists(store.RETRY_JOB, job_key):
		return False
	current = frappe.db.get_value(store.RETRY_JOB, job_key, "delta", for_update=True)
	if current is None:
		return False
	merged = delta.merge_delta(delta.parse_delta(current) or {}, entries)
	values: dict[str, str | datetime | None] = {
		"delta": delta.dump_delta(merged),
		"next_retry_at": now_datetime(),
	}
	if error_log:
		values["error_log"] = error_log
	frappe.db.set_value(store.RETRY_JOB, job_key, values, update_modified=False)
	return True


def upsert_row(
	job_key: str,
	direction: Direction,
	target: dict[str, str | int],
	reference_name: str | None,
	entries: dict[str, str],
	error_log: str | None = None,
) -> str:
	"""Merge into the target's one row, or insert it. Every merge sets next_retry_at = now."""
	row: dict[str, str | int | datetime | None] = {
		"doctype": store.RETRY_JOB,
		"job_key": job_key,
		"handler": delta.HANDLERS[direction],
		"target": json.dumps(target, sort_keys=True),
		"delta": delta.dump_delta(entries),
		"integration": INTEGRATION,
		"reference_doctype": "Task",
		"reference_name": reference_name,
		"status": "Pending",
		"next_retry_at": now_datetime(),
		"error_log": error_log,
	}
	for _attempt in range(UPSERT_PASSES):
		if merge_into_row(job_key, entries, error_log) or store.insert_unique(row):
			return job_key
	raise frappe.ValidationError(f"Could not write Retry Job {job_key}.")


def upsert_task_job(
	link_name: str, task_name: str, entries: dict[str, str], error_log: str | None = None
) -> str:
	"""The Envision → GitHub row ``github:task:<task_name>``. Returns its name.

	A row whose Task is gone keeps its old name as its key, so pass that name
	(``links.job_task_name``). Only a Task that exists is written as its reference.
	"""
	return upsert_row(
		delta.outbound_job_key(task_name),
		"outbound",
		{"link": link_name},
		task_name if frappe.db.exists("Task", task_name) else None,
		entries,
		error_log,
	)


def upsert_issue_job(
	repository_id: str,
	issue_id: str,
	issue_number: int,
	task_name: str | None,
	entries: dict[str, str],
	error_log: str | None = None,
) -> str:
	"""The GitHub → Envision row ``github:issue:<repository_id>:<issue_id>``. Returns
	its name. An Issue not imported yet has no Task to refer to."""
	return upsert_row(
		delta.inbound_job_key(repository_id, issue_id),
		"inbound",
		{"repository_id": repository_id, "issue_id": issue_id, "issue_number": issue_number},
		task_name,
		entries,
		error_log,
	)


def make_due(names: list[str]) -> None:
	"""Try these rows at the cron's next pass, with the same delta. One conditional write,
	which sees each row as committed, so it needs no read first and no link lock.

	``next_retry_at`` is how the cron sees a merge, so only a Pending row is written. A
	Running row is being tried now and is left out: written, it would count as merged when
	its run ended (``setu.retry_jobs.settle_row``), which loses no key but runs the finished
	ones again and uses an attempt. The cron takes a row's lock to lease it, so this waits
	for that and sees Running, and no lease can be holding a value written here.
	"""
	if names:
		frappe.db.set_value(
			store.RETRY_JOB,
			{"name": ["in", names], "status": PENDING},
			"next_retry_at",
			now_datetime(),
			update_modified=False,
		)


def project_rows(project: str, repository: str) -> list[str]:
	"""A Project's rows for its route's repository: its links', in both directions, and
	those of Issues not imported yet, which have no link."""
	links = frappe.get_all(
		store.ISSUE_SYNC,
		filters={"project": project, "repository_id": repository},
		fields=["name", "repository_id", "repository_provider_issue_id"],
	)
	unimported = frappe.get_all(
		store.RETRY_JOB,
		filters={"job_key": ["like", f"{delta.INBOUND_KEY_PREFIX}{repository}:%"]},
		pluck="name",
	)
	return sorted({*store.retry_job_names(links), *unimported})


def job_gated(job: frappe._dict) -> bool:
	"""Retry Job gate (hooks.py retry_job_gate). Not gated means Project sync on and the
	site binding confirmed. Any other reason a route can't carry Issues is a failure the
	handler reports. An inbound row goes by its repository's route, with a link or not. A
	route that has gone counts as gated. An outbound row with no link has nothing to
	wait for: its handler finishes it."""
	if connection.binding_changed():
		return True
	target = delta.parse_object(job.target) or {}
	if delta.job_direction(job.job_key) == "outbound":
		return link_gated(str(target.get("link") or ""))
	route = projects.route_for(repository=str(target.get("repository_id") or ""))
	return not route or not route["sync_enabled"]


def link_gated(link_name: str) -> bool:
	link = frappe.db.get_value(store.ISSUE_SYNC, link_name, ["project", "repository_id"], as_dict=True)
	if not link:
		return False
	route = projects.route_for(project=link.project)
	return not route or not route["sync_enabled"] or route["repository"] != link.repository_id


def log_failure(exc: BaseException, link_name: str | None) -> str | None:
	"""Write the Error Log for a failed sync and return its name. An Issue not imported
	yet has no link to name. Only messages safe to store are kept; any other exception
	logs its source locations and type."""
	detail = store.error_text(exc) if isinstance(exc, GitHubError | frappe.ValidationError) else None
	return store.log_safe(exc, FAILURE_TITLE, store.ISSUE_SYNC, link_name, detail=detail)
