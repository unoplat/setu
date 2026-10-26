"""Runs a link's queued operations, one link at a time.

One job per link (``job_id`` deduplicated), holding a Redis lock for the
link, so two workers never write the same Task or Issue at once. Due
operations run in order: an import or a create before a reconcile. No
database row lock is held across a GitHub request.

Failures:

- rate limits wait until GitHub's reset without using an attempt;
- an uncertain create becomes ``Uncertain`` and is looked up before any new
  create (setu.github.outbound);
- access loss on a create pauses the link for review;
- other errors back off exponentially, up to ``MAX_OP_ATTEMPTS``, then the
  operation and link show an Error until someone retries.
"""

from datetime import datetime

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime
from redis.exceptions import LockError

from setu.github import clock, inbound, outbound, reconcile, store
from setu.github.client import GitHubError

KIND_ORDER = {"import_issue": 0, "create_issue": 1, "reconcile": 2}
MAX_OPS_PER_JOB = 20
UNCERTAIN_RETRY_MINUTES = 2


def process_link(link: str) -> None:
	try:
		with store.link_lock(link):
			for _index in range(MAX_OPS_PER_JOB):
				op = next_due(link)
				if not op:
					return
				run(op)
	except LockError:
		# Another worker holds the link; its loop or recovery picks this up.
		return


def next_due(link: str) -> frappe._dict | None:
	now = now_datetime()
	rows = frappe.get_all(
		store.OPERATION,
		filters={"link": link, "status": ["in", ["Queued", "Waiting", "Retrying", "Uncertain"]]},
		fields=["name", "link", "kind", "status", "retry_at", "attempts", "project"],
		order_by="creation asc",
	)
	due = [row for row in rows if row.status == "Queued" or (row.retry_at and row.retry_at <= now)]
	due.sort(key=lambda row: KIND_ORDER.get(row.kind, 9))
	return due[0] if due else None


def run(op: frappe._dict) -> None:
	frappe.db.set_value(
		store.OPERATION, op.name, {"status": "Running", "started_at": now_datetime(), "error": None}
	)
	frappe.db.commit()
	attempted = False
	try:
		result = dispatch(op)
	except GitHubError as exc:
		frappe.db.rollback()
		result, attempted = failed(op, exc)
	except frappe.TimestampMismatchError:
		# The Task changed while it was being compared: compare again soon.
		frappe.db.rollback()
		result = store.outcome("Waiting", retry_at=add_to_date(now_datetime(), seconds=30))
	except Exception as exc:
		frappe.db.rollback()
		store.log_safe(exc, "GitHub sync operation failed", store.OPERATION, op.name)
		result = store.outcome(
			"Waiting", retry_at=store.backoff(op.attempts + 1), error=_("Envision could not sync this task.")
		)
		attempted = True
	finalize(op, result, attempted=attempted)


def dispatch(op: frappe._dict) -> store.Outcome:
	if op.kind == "create_issue":
		return outbound.create_issue(op.link, op.name)
	if op.kind == "import_issue":
		return inbound.import_issue(op.link, op.name)
	return reconcile.reconcile(op.link, op.name)


def failed(op: frappe._dict, exc: GitHubError) -> tuple[store.Outcome, bool]:
	"""The outcome of a GitHub failure, and whether it used an attempt."""
	message = str(exc)
	if exc.rate_limited:
		retry_at = clock.from_epoch(exc.retry_at) if exc.retry_at else add_to_date(now_datetime(), minutes=1)
		return store.outcome("Waiting", retry_at=retry_at, error=message), False
	if exc.uncertain and op.kind == "create_issue":
		return (
			store.outcome(
				"Uncertain",
				retry_at=add_to_date(now_datetime(), minutes=UNCERTAIN_RETRY_MINUTES),
				error=_("GitHub may have created this Issue. Envision is checking before trying again."),
			),
			True,
		)
	if op.kind in ("create_issue", "import_issue") and exc.status in (403, 404):
		store.pause_links({"name": op.link}, "access_lost")
		return store.outcome("Waiting", error=message), False
	if exc.status == 422:
		# GitHub refused the request itself; repeating it changes nothing.
		return store.outcome("Error", error=message), True
	return store.outcome("Waiting", retry_at=store.backoff(op.attempts + 1), error=message), True


def finalize(op: frappe._dict, result: store.Outcome, *, attempted: bool) -> None:
	row = frappe.db.get_value(
		store.OPERATION, op.name, ["status", "rerun", "attempts", "kind"], as_dict=True, for_update=True
	)
	if not row or row.status == "Cancelled":
		# Cancelled while running (disconnect or delete): leave it so.
		frappe.db.commit()
		return
	attempts = row.attempts + (1 if attempted else 0)
	status = result["status"]
	if status == "Waiting" and result["retry_at"] and attempted:
		status = "Retrying"
	if attempted and attempts >= store.MAX_OP_ATTEMPTS and status in ("Retrying", "Uncertain"):
		status = "Error"
	values: dict[str, str | int | datetime | None] = {
		"status": status,
		"attempts": 0 if status == "Done" else attempts,
		"retry_at": result["retry_at"] if status in ("Waiting", "Retrying", "Uncertain") else None,
		"error": result["error"],
		"rerun": 0,
	}
	if status == "Done" and row.rerun:
		# Triggered again while running: run once more with the latest state.
		values.update({"status": "Queued", "retry_at": None})
	elif status in ("Done", "Cancelled", "Error"):
		values["open_key"] = None
	frappe.db.set_value(store.OPERATION, op.name, values)
	if status == "Error":
		mark_link_error(op.link, result["error"])
	elif status in ("Retrying", "Uncertain") and result["error"]:
		# Visible on the Task while it retries; cleared by the next success.
		frappe.db.set_value(store.ISSUE_SYNC, op.link, "error", result["error"])
	frappe.db.commit()


def mark_link_error(link: str, error: str | None) -> None:
	state = frappe.db.get_value(store.ISSUE_SYNC, link, "sync_state")
	if state in store.ACTIVE_STATES:
		frappe.db.set_value(
			store.ISSUE_SYNC,
			link,
			{"sync_state": "Error", "error": error or _("Envision could not sync this task.")},
		)
