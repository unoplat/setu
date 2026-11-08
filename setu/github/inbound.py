"""GitHub → Envision: apply what an Issue's webhooks made stale.

A webhook that passed its gates (setu.github.events) is applied inline, in its
request, when it can be. It waits in the Issue's ``github:issue`` Retry Job row
instead when the site binding is unconfirmed, a row already exists, or the
per-Issue lock is busy, and goes there too when applying it fails. Only an
infrastructure outage replies 5xx, so GitHub records the delivery as failed and
the redelivery cron gets it back. Rows hold identifiers only, never payloads.

Which Issues become Tasks (docs/adr/0008): every Issue in the routed repository,
open or closed, labelled or not. Never a pull request, or Envision's own Issue
(this site's app bot opened it and its body carries a Task-name marker). The
``github`` tag gates only Envision → GitHub publication (setu.github.links).

An import inserts the Task and its link in one transaction. The link's unique
Issue id stops a concurrent import, whose Task goes back with its savepoint.

A key re-reads the Issue, one GET for all the keys of a run, and copies GitHub's
current value onto the Task through the normal save, as the integration user and
with no push back. There are no conflicts: the last sync wins. Each key has its
own savepoint. The cron keeps what the others finished; a failure inline rolls
everything back and records the whole delta.

``issue: delete`` reads nothing: the signed event is the evidence, and a 404 or 410 on
a read never is. It deletes the Task tree, and a refusal keeps retrying from
to_be_deleted with the Task still visible. With no link, a late event for an Issue that
has gone finishes with nothing imported or deleted (``issue_gone``).

An imported Issue learns its parent from a ``parent: sync`` key (``queue_imported_parent``):
the parent may not be imported yet, and that must not hold the import back.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import NamedTuple

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, sanitize_html, today
from frappe.utils.nestedset import get_descendants_of
from pymysql.constants import CR
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from setu.api.task import (
	check_no_open_subtasks,
	check_parent_due_date,
	check_parent_rules,
	delete_task_tree,
	note_subtask,
	subtree_documents,
)
from setu.github import (
	bot,
	client,
	comments,
	connection,
	convert,
	delta,
	issues,
	link_state,
	links,
	outbound,
	projects,
	retry,
	store,
	titles,
)
from setu.github.client import GitHubError
from setu.github.issues import IssueData
from setu.retry_jobs import HandlerResult

KEY_SAVEPOINT = "envision_github_key"
IMPORT_SAVEPOINT = "envision_github_import"
CANCELLED_REASONS = frozenset({"not_planned", "duplicate"})
# A larger tree deletes from its Retry Job row: inline work has to stay inside GitHub's
# 10 second window, and how long a delete takes grows with the tree.
MAX_INLINE_DELETE_TASKS = 25
# What ``issue: sync`` brings up to date on a linked Issue. A parent has its own key
# and can wait for another Issue, which must not hold these back.
ISSUE_FIELDS = ("title", "description", "status")
PARENT_RESOURCE = "parent"
# What a read of an Issue that isn't there gets. Losing access can look the same.
MISSING_STATUSES = frozenset({404, 410})
# The connection-level failures. Frappe raises the driver's own error for these, with
# the same numbers in both of its MariaDB drivers (Database.sql only wraps deadlocks
# and lock wait timeouts, which happen with MariaDB up and are ordinary failures).
LOST_CONNECTION = frozenset(
	{
		CR.CR_CONNECTION_ERROR,
		CR.CR_CONN_HOST_ERROR,
		CR.CR_IPSOCK_ERROR,
		CR.CR_UNKNOWN_HOST,
		CR.CR_SERVER_GONE_ERROR,
		CR.CR_SERVER_LOST,
		CR.CR_SERVER_LOST_EXTENDED,
	}
)


class RetryRowWriteError(Exception):
	"""The event's Retry Job row could not be written, so it isn't stored anywhere:
	GitHub has to see a failed delivery. A validation refusal alone would reply 417."""

	http_status_code = 500


def is_infrastructure(exc: BaseException) -> bool:
	"""MariaDB unreachable, server gone away or connection lost, or Redis unreachable."""
	if isinstance(exc, RedisConnectionError | RedisTimeoutError):
		return True
	if frappe.db.is_interface_error(exc):
		return True
	return isinstance(exc, frappe.db.OperationalError) and bool(exc.args) and exc.args[0] in LOST_CONNECTION


def apply_or_queue(
	target: dict[str, str | int],
	entries: dict[str, str],
	link: frappe._dict | None,
	sender: str | None = None,
) -> None:
	"""GitHub → Envision 1, part 2, for an event's non-empty delta. Returning means
	reply 200; anything raised is a 5xx. ``link`` is the Issue's link, if it has one.
	``sender`` is named in the Activity only if the change applies here and now."""
	if connection.binding_changed() or tree_too_large_inline(entries, link):
		queue_event(target, entries, link.name if link else None)
		return
	job_key = delta.inbound_job_key(str(target["repository_id"]), str(target["issue_id"]))
	if retry.merge_into_row(job_key, entries, None):
		return
	lock = store.issue_lock_nowait(str(target["issue_id"]))
	if not lock.acquire():
		queue_event(target, entries, link.name if link else None)
		return
	try:
		apply_inline(target, entries, sender)
	finally:
		lock.release()


def tree_too_large_inline(entries: dict[str, str], link: frappe._dict | None) -> bool:
	if entries.get(delta.ISSUE_RESOURCE) != delta.DELETE or not link or not link.task:
		return False
	if not frappe.db.exists("Task", link.task):
		return False
	# The Task itself is one more than its descendants, so stop counting at the limit.
	descendants = get_descendants_of(
		"Task", link.task, limit=MAX_INLINE_DELETE_TASKS, ignore_permissions=True
	)
	return len(descendants) >= MAX_INLINE_DELETE_TASKS


def apply_inline(target: dict[str, str | int], entries: dict[str, str], sender: str | None = None) -> None:
	"""Apply the delta in the request's transaction. Infrastructure errors are raised,
	and any other failure goes to the Retry Job row, including one settling the link:
	the keys run again from there, which is safe, and the row's on-done hook settles it.

	The commit comes before settling so that it reads the rows other transactions
	wrote during the GitHub requests."""
	try:
		with client.bounded_requests(), bot.syncing():
			apply_keys(target, entries, set(), sender)
		frappe.db.commit()
		record_applied(str(target["issue_id"]))
		if entries.get(delta.ISSUE_RESOURCE) == delta.DELETE:
			end_row_written_meanwhile(target, entries)
		frappe.db.commit()
	except Exception as exc:
		if is_infrastructure(exc):
			raise
		record_failure(target, entries, exc)


def record_applied(issue_id: str) -> None:
	"""The change reached the Task. Applying ``issue: delete`` or a transfer removed the
	link, and to_be_updated stays while link.delta has keys (``links.settle``)."""
	link = links.link_for_issue(issue_id)
	if link:
		frappe.db.set_value(
			store.ISSUE_SYNC, link.name, "last_synced_at", now_datetime(), update_modified=False
		)
		links.settle(link.name)


def end_row_written_meanwhile(target: dict[str, str | int], entries: dict[str, str]) -> None:
	"""A webhook that found the lock busy can commit a row this run's snapshot couldn't
	see, so deleting the link missed it. With no Task its keys would fail for ever;
	holding the delete instead, it finishes with no link to act on."""
	job_key = delta.inbound_job_key(str(target["repository_id"]), str(target["issue_id"]))
	retry.merge_into_row(job_key, entries, None)


def record_failure(target: dict[str, str | int], entries: dict[str, str], exc: Exception) -> None:
	"""Roll back what the apply did and leave the delta for the cron. The messages a
	refusal queued are dropped: the reply to GitHub would otherwise carry them."""
	frappe.db.rollback()
	frappe.clear_messages()
	link = links.link_for_issue(str(target["issue_id"]))
	link_name = link.name if link else None
	queue_event(target, entries, link_name, error_log=retry.log_failure(exc, link_name), failed=True)


def queue_event(
	target: dict[str, str | int],
	entries: dict[str, str],
	link_name: str | None,
	*,
	error_log: str | None = None,
	failed: bool = False,
) -> None:
	"""Upsert the Issue's Retry Job row and settle its link, if it has one.

	Commit writes before a caller releases the per-Issue Redis lock.

	A link that went, or became unlinked or to_be_deleted, while this waited for its
	lock ignores the change, so nothing is stored, except a refused delete, which only
	an unlinked link ignores. Only ``failed`` with ``issue: delete`` means refused.
	"""
	link = links.locked_link(link_name) if link_name else None
	refused = failed and entries.get(delta.ISSUE_RESOURCE) == delta.DELETE
	if link_name and (not link or not keeps_event(link.sync_state, refused)):
		return
	write_row(target, entries, link.task if link else None, error_log)
	if link and refused:
		mark_delete_refused(link)
	elif link:
		links.settle(link.name)
	# A concurrent webhook must see the queued delta when the Issue lock is released.
	frappe.db.commit()  # nosemgrep: frappe-manual-commit


def mark_delete_refused(link: frappe._dict) -> None:
	"""to_be_deleted wins, and the link's github:issue row holds the delete. Every other
	key goes, so no push is left to reach an Issue that has gone."""
	job_key = delta.inbound_job_key(link.repository_id, link.repository_provider_issue_id)
	links.delete_retry_jobs(link, keep_job=job_key)
	frappe.db.set_value(
		store.ISSUE_SYNC,
		link.name,
		{"sync_state": link_state.on_inbound_delete_refused(link.sync_state), "delta": None},
		update_modified=False,
	)


def keeps_event(state: link_state.LinkState, refused: bool) -> bool:
	if refused:
		return link_state.on_inbound_delete_refused(state) == link_state.TO_BE_DELETED
	return link_state.on_inbound_failed(state) == link_state.Outcome.QUEUE_FOR_CRON


def write_row(
	target: dict[str, str | int], entries: dict[str, str], task_name: str | None, error_log: str | None
) -> None:
	try:
		retry.upsert_issue_job(
			str(target["repository_id"]),
			str(target["issue_id"]),
			int(target["issue_number"]),
			task_name,
			entries,
			error_log,
		)
	except Exception as exc:
		raise RetryRowWriteError(
			f"Could not write the Retry Job row for Issue {target['issue_id']}."
		) from exc


def apply_issue_delta(target: dict[str, str | int], entries: dict[str, str] | None = None) -> HandlerResult:
	"""Retry Job handler, for the cron, which owns the row. A busy lock finishes
	nothing: the row is still there on the next pass. There is no job mode inbound."""
	if not entries:
		return HandlerResult(frozenset())
	lock = store.issue_lock_nowait(str(target["issue_id"]))
	if not lock.acquire():
		return HandlerResult(frozenset())
	try:
		return run_cron(target, entries)
	finally:
		lock.release()


def run_cron(target: dict[str, str | int], entries: dict[str, str]) -> HandlerResult:
	"""Commit and report the keys that finished, with the Error Log for the first
	failure. Settling reads this row, so it leaves the link cron_sync, and the row's
	on-done hook settles it. An infrastructure error or a failed commit finishes nothing.
	A refused ``issue: delete`` leaves the link to_be_deleted, and the row retries it."""
	if links.in_other_project(links.link_for_issue(str(target["issue_id"])), str(target["repository_id"])):
		# The link is another Project's: these keys finish with no write.
		return HandlerResult(frozenset(entries))
	done: set[str] = set()
	try:
		with bot.syncing():
			failure = run_keys(KeyRun(target, cron=True), entries, done)
		if done:
			record_applied(str(target["issue_id"]))
		frappe.db.commit()
	except Exception as exc:
		frappe.db.rollback()
		done.clear()
		failure = exc
	if failure is None:
		return HandlerResult(frozenset(done))
	if outbound.is_rate_limited(failure):
		return HandlerResult(frozenset(done), rate_limited=True)
	link = links.link_for_issue(str(target["issue_id"]))
	error = retry.log_failure(failure, link.name if link else None)
	if link and entries.get(delta.ISSUE_RESOURCE) == delta.DELETE and not is_infrastructure(failure):
		locked = links.locked_link(link.name)
		if locked:
			mark_delete_refused(locked)
	# Persist the refusal/error before releasing the Issue lock and settling its lease.
	frappe.db.commit()  # nosemgrep: frappe-manual-commit
	return HandlerResult(frozenset(done), error=error)


@dataclass
class KeyRun:
	"""One pass over an Issue's keys, and what they share."""

	target: dict[str, str | int]
	sender: str | None = None
	"""Who sent the webhook. The cron has no name."""
	cron: bool = False
	"""The cron runs this, and owns the Issue's Retry Job row."""
	fetched: tuple[dict, IssueData] | None = None
	"""The Issue's route and the one GET of the Issue."""
	read_failure: Exception | None = None
	task: str | None = None
	applied: list[str] = field(default_factory=list)
	"""What this run changed on ``task``, for its Activity comment."""
	imported: tuple[str, IssueData] | None = None
	"""The link this run's ``issue: sync`` imported, and its Issue."""


def apply_keys(
	target: dict[str, str | int], entries: dict[str, str], done: set[str], sender: str | None = None
) -> None:
	"""Apply each key, adding what finishes to ``done``. The first failure is raised
	once every key has had its turn: inline, the caller rolls everything back."""
	failure = run_keys(KeyRun(target, sender), entries, done)
	if failure:
		raise failure


def run_keys(run: KeyRun, entries: dict[str, str], done: set[str]) -> Exception | None:
	"""Each key in its own savepoint, so one failing rolls back only itself. Returns the
	first failure. An infrastructure error is raised at once: no key can run after it."""
	first: Exception | None = None
	for resource in key_order(entries):
		frappe.db.savepoint(KEY_SAVEPOINT)
		try:
			apply_key(run, resource, entries[resource])
		except Exception as exc:
			if is_infrastructure(exc):
				raise
			first = first or exc
			undo_key(run, done)
		else:
			done.add(resource)
	note_update(run)
	queue_run_parent(run, entries, done)
	queue_run_comments(run, entries, done)
	return first


def key_order(entries: dict[str, str]) -> list[str]:
	"""``issue`` first: it can import the Task the other keys need. Then the Task's
	fields, the Issue's comment history, and single comments in the order GitHub
	numbered them."""
	return sorted(entries, key=key_rank)


def key_rank(resource: str) -> tuple[int, int]:
	if resource == delta.ISSUE_RESOURCE:
		return (0, 0)
	if resource == delta.COMMENTS_RESOURCE:
		return (2, 0)
	if resource.startswith(delta.COMMENT_PREFIX):
		comment_id = resource.removeprefix(delta.COMMENT_PREFIX)
		return (3, int(comment_id) if delta.is_numeric_id(comment_id) else 0)
	return (1, 0)


def undo_key(run: KeyRun, done: set[str]) -> None:
	"""Back to the key's savepoint. A deadlock has already rolled the whole transaction
	back, savepoint and finished keys included, so those are not finished after all."""
	try:
		frappe.db.rollback(save_point=KEY_SAVEPOINT)
	except Exception:
		frappe.db.rollback()
		done.clear()
		run.applied.clear()
		run.imported = None


def apply_key(run: KeyRun, resource: str, action: str) -> None:
	if resource == delta.ISSUE_RESOURCE and action == delta.SYNC:
		apply_issue_sync(run)
	elif resource == delta.ISSUE_RESOURCE and action == delta.TRANSFERRED:
		apply_transferred(run)
	elif resource == delta.ISSUE_RESOURCE and action == delta.DELETE:
		apply_issue_deleted(run)
	elif resource in delta.FIELD_RESOURCES and action == delta.SYNC:
		apply_field_key(run, resource)
	elif resource == delta.COMMENTS_RESOURCE and action == delta.SYNC:
		comments.import_all(run.target)
	elif resource.startswith(delta.COMMENT_PREFIX) and action in (delta.SYNC, delta.DELETE):
		comments.apply_comment(run.target, resource.removeprefix(delta.COMMENT_PREFIX), action)
	else:
		raise NotImplementedError(f"Applying {resource}: {action} is not built.")


def read_issue(run: KeyRun) -> tuple[dict, IssueData]:
	"""The run's one GET. A failure is kept too, so it is not sent again. A 404 or 410
	fails like any other: losing access looks the same, so it never proves a deletion.
	Only ``issue_gone`` reads more into it, and never for an Issue with a link."""
	if run.read_failure:
		raise run.read_failure
	if run.fetched is None:
		try:
			run.fetched = fetch_issue(run.target)
		except Exception as exc:
			run.read_failure = exc
			raise
	return run.fetched


def fetch_issue(target: dict[str, str | int]) -> tuple[dict, IssueData]:
	route = projects.route_for(repository=str(target["repository_id"]))
	blocker = projects.sync_blocker(route)
	if not route or blocker:
		raise frappe.ValidationError(projects.inactive_message(blocker or "not_connected"))
	row = route["repository_row"]
	issue = issues.get_issue(row.installation, row.full_name, int(target["issue_number"]))
	if issue["id"] != str(target["issue_id"]):
		raise GitHubError("GitHub returned another Issue for this number.")
	return route, issue


def issue_gone(run: KeyRun) -> bool:
	"""A late event: the Issue has no link and reads as gone, in a repository that can
	still be read, so its key is done and nothing is imported or deleted. A repository
	that can't be read raises, and the key retries. With a link this is always False."""
	if links.link_for_issue(str(run.target["issue_id"])):
		return False
	try:
		read_issue(run)
	except GitHubError as exc:
		if exc.status not in MISSING_STATUSES:
			raise
		route = projects.route_for(repository=str(run.target["repository_id"]))
		if not route:
			raise
		row = route["repository_row"]
		issues.check_repository(row.installation, row.full_name)
		return True
	return False


# GitHub → Envision 2: issue: sync.


class SyncResult(NamedTuple):
	"""What ``issue: sync`` found for an Issue."""

	link_name: str | None
	"""The Issue's link, or None for no link and no Task to make."""
	existing: frappe._dict | None = None
	"""A link that was already there: its Task is applied as an update."""
	imported: bool = False
	"""This call inserted the Task and ``link_name``."""


def apply_issue_sync(run: KeyRun) -> None:
	if issue_gone(run):
		return
	route, issue = read_issue(run)
	result = sync_issue(route, issue)
	if result.imported and result.link_name:
		run.imported = (result.link_name, issue)
	elif result.existing and result.existing.sync_state not in link_state.MARKS:
		merge_fields(run, result.existing, issue)


def queue_run_parent(run: KeyRun, entries: dict[str, str], done: set[str]) -> None:
	"""After a run's import has succeeded. The cron owns its row, but this merge is the
	same as a webhook's during the run. A ``parent`` key in the run has had its turn."""
	if run.imported and delta.ISSUE_RESOURCE in done and PARENT_RESOURCE not in entries:
		link_name, issue = run.imported
		queue_imported_parent(str(run.target["repository_id"]), link_name, issue)


def queue_imported_parent(repository_id: str, link_name: str, issue: IssueData) -> None:
	"""An Issue just imported or re-linked that GitHub says has a parent: trees are
	never flattened. A parent not imported yet makes the key fail and retry. An Issue
	that doesn't say learns its parent from its next ``sub_issues`` event."""
	if issue["parent_known"] and issue["parent_number"]:
		queue_parent_key(repository_id, issue, link_name)


def queue_parent_key(repository_id: str, issue: IssueData, link_name: str) -> None:
	"""``parent: sync`` in the Issue's Retry Job row, which makes the link cron_sync."""
	queue_issue_keys(repository_id, issue, link_name, {PARENT_RESOURCE: delta.SYNC})


def queue_run_comments(run: KeyRun, entries: dict[str, str], done: set[str]) -> None:
	"""After a run's import has succeeded, as ``queue_run_parent``."""
	if run.imported and delta.ISSUE_RESOURCE in done and delta.COMMENTS_RESOURCE not in entries:
		link_name, issue = run.imported
		queue_imported_comments(str(run.target["repository_id"]), link_name, issue)


def queue_imported_comments(repository_id: str, link_name: str, issue: IssueData) -> None:
	"""An Issue just imported, re-linked or read again at turn-on brings every comment it
	has, from the cron: a long history never has to fit in a webhook's 10 seconds."""
	if issue["comment_count"]:
		queue_issue_keys(repository_id, issue, link_name, {delta.COMMENTS_RESOURCE: delta.SYNC})


def queue_issue_keys(repository_id: str, issue: IssueData, link_name: str, entries: dict[str, str]) -> None:
	"""Keys in the Issue's Retry Job row, which makes the link cron_sync."""
	link = links.locked_link(link_name)
	retry.upsert_issue_job(repository_id, issue["id"], issue["number"], link.task if link else None, entries)
	links.settle(link_name)


def target_for(repository_id: str, issue: IssueData) -> dict[str, str | int]:
	return {"repository_id": repository_id, "issue_id": issue["id"], "issue_number": issue["number"]}


def pending_keys(link_name: str) -> set[str]:
	return links.pending_keys(link_name)


def merge_fields(run: KeyRun, link: frappe._dict, issue: IssueData) -> None:
	"""Re-read an Issue that already has its Task, field by field. There are no baselines:
	a field with a key pending is left for the push, because Envision wins, and any other
	takes GitHub's current value, which changes nothing if neither side changed."""
	pending = pending_keys(link.name)
	resources = tuple(resource for resource in ISSUE_FIELDS if resource not in pending)
	if resources:
		apply_fields(run, link, issue, resources)


def import_issue(route: dict, issue: IssueData) -> str | None:
	"""Import one Issue already read from GitHub, and return its link's name; None for a
	pull request, a closed Issue with no link, or Envision's own Issue or a marked link,
	which never import. A link
	that exists is not written. A refused Task raises, and the caller's savepoint undoes
	any partial work, as a key's does."""
	return sync_issue(route, issue).link_name


def sync_issue(route: dict, issue: IssueData) -> SyncResult:
	if issue["is_pull_request"]:
		return SyncResult(None)
	marker = convert.find_marker(issue["body"])
	if marker and outbound.created_by_app(issue, outbound.app_login()):
		return SyncResult(links.fill_issue_identity(marker, route["repository"], issue_identity(issue)))
	link = links.link_for_issue(issue["id"])
	if link and not link_state.accepts_import(link.sync_state):
		return SyncResult(None)
	if link:
		return SyncResult(link.name, link)
	if issue["state"] != "open":
		# A closed Issue with no link is never imported, by a webhook or at turn-on.
		# Reopening it imports it.
		return SyncResult(None)
	return insert_imported(route, issue)


def insert_imported(route: dict, issue: IssueData) -> SyncResult:
	"""The Task and its link, in one transaction. A concurrent import that got there
	first takes the Task with it back to the savepoint, and this becomes an update."""
	frappe.db.savepoint(IMPORT_SAVEPOINT)
	with bot.as_bot():
		task = insert_task(route, issue)
	name = store.insert_unique(
		{
			"doctype": store.ISSUE_SYNC,
			"task": task.name,
			"project": route["project"],
			"repository_id": route["repository"],
			"repository_full_name": route["repository_row"].full_name,
			"origin": "GitHub",
			"sync_state": link_state.SYNCED,
			"last_synced_at": now_datetime(),
			**issue_identity(issue),
		}
	)
	if name:
		return SyncResult(name, imported=True)
	frappe.db.rollback(save_point=IMPORT_SAVEPOINT)
	# Locking, because a plain read may not see a row this transaction's snapshot predates.
	winner = frappe.db.get_value(
		store.ISSUE_SYNC,
		{"repository_provider_issue_id": issue["id"]},
		links.LINK_FIELDS,
		as_dict=True,
		for_update=True,
	)
	if not winner:
		raise frappe.ValidationError(_("Another import of this GitHub Issue did not finish."))
	return SyncResult(winner.name, winner)


def insert_task(route: dict, issue: IssueData) -> Document:
	"""The normal Task insert, so every validation runs. A title longer than a subject
	continues in the description (setu.github.titles)."""
	subject, rest = titles.split(whole_title(issue), subject_limit())
	task = frappe.new_doc("Task")
	task.project = route["project"]
	task.subject = subject
	task.description = titles.compose(
		None, convert.markdown_to_html(issue["body"])["html"], titles.note(rest), False
	)
	task.priority = "Medium"
	# As create_task does, so imported Tasks can hold Subtasks.
	task.is_group = 1
	task.status = task_status(issue)
	if task.status == "Completed":
		task.completed_on = today()
		task.completed_by = bot.BOT_USER
	task.insert(ignore_permissions=True)
	task.add_comment("Info", imported_text(route, issue))
	return task


def imported_text(route: dict, issue: IssueData) -> str:
	text = _("Imported from GitHub issue {0}#{1}").format(route["repository_row"].full_name, issue["number"])
	if issue["author_login"]:
		text += " " + _("(opened by @{0})").format(issue["author_login"])
	return text


def issue_identity(issue: IssueData) -> dict[str, str | int]:
	return {
		"repository_provider_issue_id": issue["id"],
		"issue_node_id": issue["node_id"],
		"issue_number": issue["number"],
		"issue_url": issue["html_url"],
	}


# GitHub → Envision 3: title, description, status, parent.


def apply_field_key(run: KeyRun, resource: str) -> None:
	"""A key for an Issue with no Task yet fails and stays, until it has been imported.
	A closed Issue with no Task is never imported, so its key is done."""
	link = links.link_for_issue(str(run.target["issue_id"]))
	if not link:
		if issue_gone(run) or read_issue(run)[1]["state"] != "open":
			return
		raise frappe.ValidationError(
			_("GitHub Issue #{0} has no Task here yet.").format(run.target["issue_number"])
		)
	if link.sync_state in link_state.MARKS:
		return
	route, issue = read_issue(run)
	if resource == PARENT_RESOURCE:
		apply_parent(run, route, link, issue)
	else:
		apply_fields(run, link, issue, (resource,))


def apply_fields(run: KeyRun, link: frappe._dict, issue: IssueData, resources: tuple[str, ...]) -> None:
	"""Save what differs in one normal save. A refusal is raised, so the key stays."""
	with bot.as_bot():
		task = frappe.get_doc("Task", link.task)
		changed = [resource for resource in resources if FIELD_WRITERS[resource](task, issue)]
		if changed:
			task.save(ignore_permissions=True)
	if changed:
		run.task = link.task
		run.applied.extend(field_label(resource) for resource in changed)


def whole_title(issue: IssueData) -> str:
	return issue["title"].strip() or _("Untitled GitHub issue")


def subject_limit() -> int:
	subject = frappe.get_meta("Task").get_field("subject")
	return int(subject.length) if subject and subject.length else 140


def write_title(task: Document, issue: IssueData) -> bool:
	"""GitHub's title: what fits in the subject, the rest in the description's note."""
	value = whole_title(issue)
	if titles.same(titles.title(task.subject, task.description, False), value):
		return False
	subject, rest = titles.split(value, subject_limit())
	task.subject = subject
	task.description = titles.compose(task.description, None, titles.note(rest), False)
	return True


def write_description(task: Document, issue: IssueData) -> bool:
	"""The body as HTML, keeping the title's note. Compared as the Task will store it,
	Text Editor sanitizing included, so an unchanged body writes nothing."""
	html = convert.markdown_to_html(issue["body"])["html"]
	current = convert.html_digest(titles.content(task.description, False))
	if current == convert.html_digest(sanitize_html(html, linkify=True)):
		return False
	task.description = titles.compose(task.description, html, None, False)
	return True


def write_status(task: Document, issue: IssueData) -> bool:
	"""The status GitHub's state maps to. A Task the state already describes stays as it
	is: an open Issue says nothing about In Progress or Blocked."""
	status = task_status(issue)
	if issues.state_patch(task.status) == issues.state_patch(status):
		return False
	set_task_status(task, status)
	return True


def task_status(issue: IssueData) -> str:
	if issue["state"] == "open":
		return "Open"
	return "Cancelled" if issue["state_reason"] in CANCELLED_REASONS else "Completed"


def set_task_status(task: Document, status: str) -> None:
	"""Completion follows update_task's bookkeeping and refusals."""
	if status == "Completed" and task.status != "Completed":
		check_no_open_subtasks(task)
		if not task.completed_on:
			task.completed_on = today()
			task.completed_by = bot.BOT_USER
	elif task.status == "Completed" and status != "Completed":
		task.completed_on = None
		task.completed_by = None
		task.progress = 0
	task.status = status


FIELD_WRITERS: dict[str, Callable[[Document, IssueData], bool]] = {
	"title": write_title,
	"description": write_description,
	"status": write_status,
}


def apply_parent(run: KeyRun, route: dict, link: frappe._dict, issue: IssueData) -> None:
	"""The child's current parent, under the parent rules. The event is not read, so a
	late removal cannot undo a newer parent."""
	parent = current_parent_task(route, link, issue)
	with bot.as_bot():
		task = frappe.get_doc("Task", link.task)
		previous = task.parent_task or None
		if parent == previous:
			return
		if parent:
			check_parent_rules(task, frappe.get_doc("Task", parent))
		task.parent_task = parent
		if parent:
			check_parent_due_date(task)
		task.save(ignore_permissions=True)
		if previous:
			note_subtask(previous, _("Moved out subtask {0}").format(task.subject))
		if parent:
			note_subtask(parent, _("Moved in subtask {0}").format(task.subject))
	run.task = link.task
	run.applied.append(field_label("parent"))


def current_parent_task(route: dict, link: frappe._dict, issue: IssueData) -> str | None:
	"""The Task of the Issue's parent; None for no parent. A parent with no Task in this
	Project, in this repository or not, fails and the key stays: the tree is never
	flattened, and a key's Error Log is where a sub-issue error shows now."""
	stated = stated_parent(route, issue)
	number = stated["number"]
	if not number:
		return None
	if (stated["full_name"] or "").lower() != route["repository_row"].full_name.lower():
		raise frappe.ValidationError(
			_("On GitHub this Issue is a sub-issue of {0}#{1}, in another repository.").format(
				stated["full_name"], number
			)
		)
	parent = frappe.db.get_value(
		store.ISSUE_SYNC,
		{"repository_id": route["repository"], "issue_number": number},
		["task", "project", "sync_state"],
		as_dict=True,
	)
	if (
		not parent
		or not parent.task
		or parent.project != link.project
		or parent.sync_state in link_state.MARKS
	):
		raise frappe.ValidationError(
			_("On GitHub this Issue is a sub-issue of #{0}, which isn't synced to this project.").format(
				number
			)
		)
	return parent.task


def stated_parent(route: dict, issue: IssueData) -> issues.ParentData:
	"""The parent GitHub states now. REST's ``parent_issue_url`` is optional and silence
	isn't "no parent", so an Issue read without it asks GraphQL's ``Issue.parent``, which
	states null for none. A read that fails raises, and the key stays: a removal is only
	ever applied from GitHub saying so, never from an error or the event."""
	if issue["parent_known"]:
		return {"full_name": issue["parent_full_name"], "number": issue["parent_number"]}
	return issues.get_parent(route["repository_row"].installation, issue["node_id"])


def field_label(resource: str) -> str:
	return {
		"title": _("title"),
		"description": _("description"),
		"status": _("status"),
		"parent": _("parent task"),
	}[resource]


def note_update(run: KeyRun) -> None:
	"""One Activity comment for the run. It names the sender only inline."""
	if not run.task or not run.applied:
		return
	text = _("Updated from GitHub: {0}").format(", ".join(run.applied))
	if run.sender:
		text += " " + _("by @{0}").format(run.sender)
	with bot.as_bot():
		frappe.get_doc("Task", run.task).add_comment("Info", text)


# GitHub → Envision 4: issue: delete.


def apply_issue_deleted(run: KeyRun) -> None:
	"""The Task tree, the link and its Retry Job rows go in one transaction, with no
	GET. No link, an unlinked one or a Task already gone are all finished. The cron owns
	its row, so that one stays for the cron to delete when this key is reported done.

	The link goes first, so the Task's own ``links.on_task_trash`` finds none and makes
	no GitHub call, and nothing names the Task at Frappe's link check. Each Subtask's
	hook still finds its link: it becomes to_be_deleted, and its job deletes its Issue.
	"""
	found = links.link_for_issue(str(run.target["issue_id"]))
	link = links.locked_link(found.name) if found else None
	if not link or link.sync_state == link_state.UNLINKED:
		return
	job_key = delta.inbound_job_key(str(run.target["repository_id"]), str(run.target["issue_id"]))
	links.clear_job_references(link)
	links.delete_link(link, keep_job=job_key if run.cron else None)
	if link.task and frappe.db.exists("Task", link.task):
		delete_issue_tree(link.task)


def delete_issue_tree(task_name: str) -> None:
	"""As the integration user, children first, through normal validation and hooks.

	A refusal rolls the whole transaction back, not only the key's savepoint: Frappe
	keeps after-commit callbacks through a savepoint rollback, and the
	``delete_dynamic_links`` job of a Task that stayed would delete its Comments, ToDos
	and Versions. Nothing else is lost, because ``issue: delete`` is always alone in
	its delta (``delta.merge_delta``).
	"""
	try:
		with bot.as_bot():
			documents = subtree_documents(frappe.get_doc("Task", task_name))
			delete_task_tree(documents, ignore_permissions=True)
	except Exception as exc:
		if not is_infrastructure(exc):
			frappe.db.rollback()
		raise


# GitHub → Envision 3: issue: transferred.


def apply_transferred(run: KeyRun) -> None:
	"""The link and every Retry Job row go and the github tag comes off; the Task and
	the Issue both stay. Never a deletion. The cron owns its row, so that one stays
	for the cron to delete when this key is reported done."""
	found = links.link_for_issue(str(run.target["issue_id"]))
	link = links.locked_link(found.name) if found else None
	if not link:
		return
	job_key = delta.inbound_job_key(str(run.target["repository_id"]), str(run.target["issue_id"]))
	outcome = link_state.on_issue_transferred(
		link.sync_state, has_inbound_job=not run.cron and bool(links.inbound_job(link))
	)
	if outcome == link_state.Outcome.QUEUE_FOR_CRON:
		# A webhook that found the lock busy wrote the row during this run.
		retry.merge_into_row(job_key, {delta.ISSUE_RESOURCE: delta.TRANSFERRED}, None)
	elif outcome == link_state.Outcome.DELETE_ROW:
		if link.task:
			links.strip_github_tag(link.task)
		links.delete_link(link, keep_job=job_key if run.cron else None)
