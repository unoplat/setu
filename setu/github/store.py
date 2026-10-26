"""Durable Task ↔ Issue links and their queued operations (the outbox).

A link (Envision GitHub Issue Sync) is one Task's identity on GitHub. Work on
it is an operation (Envision GitHub Operation) written in the caller's own
transaction and handed to a worker only after that transaction commits, so a
rolled-back save never reaches GitHub and a lost queue message is recovered
by the scheduler (setu.github.recovery).

An operation has a unique ``open_key`` ("<link>:<kind>") while it is open, so
repeated triggers collapse into one row. A trigger that arrives while that
operation is running sets ``rerun``: the worker runs it once more afterwards,
so a change made mid-run is never lost.

Nothing here calls GitHub, and this module imports no other sync module, so
routing, connection and Task hooks can all use it.
"""

import random
import traceback
from collections.abc import Callable, Iterable
from datetime import datetime
from functools import partial
from typing import Literal, TypedDict

import frappe
from frappe.utils import add_to_date, now_datetime, strip_html

ISSUE_SYNC = "Envision GitHub Issue Sync"
OPERATION = "Envision GitHub Operation"
SYNC_CONFLICT = "Envision GitHub Sync Conflict"
# Records whose Link to a Task, Project or link never blocks deleting them.
GITHUB_LINK_DOCTYPES = frozenset({ISSUE_SYNC, OPERATION})

OpKind = Literal["create_issue", "import_issue", "reconcile"]
OpStatus = Literal["Queued", "Running", "Waiting", "Retrying", "Uncertain", "Done", "Cancelled", "Error"]
OPEN_OPS: tuple[OpStatus, ...] = ("Queued", "Running", "Waiting", "Retrying", "Uncertain")
LinkState = Literal["Pending", "Synced", "Conflict", "Error", "Paused", "Disconnected", "Tombstoned"]
# States in which a link's work runs. Paused links keep their operations.
ACTIVE_STATES: tuple[LinkState, ...] = ("Pending", "Synced", "Conflict", "Error")
PauseReason = Literal[
	"user_paused",
	"backlog_held",
	"route_cleared",
	"app_disconnected",
	"project_changed",
	"task_ineligible",
	"transferred",
	"remote_deleted",
	"access_lost",
	"destination_changed",
]
# Route-level pauses that enabling or reconnecting the same repository lifts.
ROUTE_PAUSES: tuple[PauseReason, ...] = ("route_cleared", "app_disconnected", "access_lost")

MAX_OP_ATTEMPTS = 8
MAX_BACKOFF_SECONDS = 6 * 3600


class Outcome(TypedDict):
	"""What an operation handler decided. Failures are raised instead."""

	status: Literal["Done", "Waiting", "Uncertain", "Cancelled", "Error"]
	retry_at: datetime | None
	error: str | None


def outcome(
	status: Literal["Done", "Waiting", "Uncertain", "Cancelled", "Error"],
	*,
	retry_at: datetime | None = None,
	error: str | None = None,
) -> Outcome:
	return {"status": status, "retry_at": retry_at, "error": error}


def insert_unique(values: dict[str, str | int | None]) -> str | None:
	"""Insert a record, or return None when a unique value already exists.

	The savepoint keeps the caller's transaction usable after the duplicate,
	and the duplicate's message is not left for the user to see.
	"""
	messages = getattr(frappe.local, "message_log", None)
	kept = len(messages) if messages is not None else 0
	frappe.db.savepoint("envision_github_unique")
	try:
		doc = frappe.get_doc(values).insert(ignore_permissions=True)
	except frappe.DuplicateEntryError, frappe.UniqueValidationError:
		frappe.db.rollback(save_point="envision_github_unique")
		if messages is not None:
			del messages[kept:]
		return None
	return doc.name


def attempt(function: Callable[[str], None], name: str) -> bool:
	"""Run one item of a bulk action. A refusal (``frappe.throw``) is undone
	and skipped, and its message is not shown: one item never fails the rest."""
	messages = getattr(frappe.local, "message_log", None)
	kept = len(messages) if messages is not None else 0
	frappe.db.savepoint("envision_github_item")
	try:
		function(name)
	except frappe.ValidationError:
		frappe.db.rollback(save_point="envision_github_item")
		if messages is not None:
			del messages[kept:]
		return False
	return True


def queue_op(link: str, kind: OpKind, project: str | None) -> None:
	"""Record work for a link in the current transaction; run it after commit."""
	key = f"{link}:{kind}"
	if not reopen(key):
		name = insert_unique(
			{
				"doctype": OPERATION,
				"link": link,
				"project": project,
				"kind": kind,
				"status": "Queued",
				"open_key": key,
				"triggered_by": frappe.session.user,
			}
		)
		if not name:
			reopen(key)
	enqueue_link(link)


def reopen(key: str) -> bool:
	"""Fold a new trigger into the open operation with this key, if any."""
	row = frappe.db.get_value(OPERATION, {"open_key": key}, ["name", "status"], as_dict=True, for_update=True)
	if not row:
		return False
	if row.status == "Running":
		frappe.db.set_value(OPERATION, row.name, "rerun", 1, update_modified=False)
	elif row.status == "Waiting":
		frappe.db.set_value(OPERATION, row.name, {"status": "Queued", "retry_at": None})
	# Retrying and Uncertain keep their schedule: a new edit does not skip a
	# backoff or an unfinished lookup.
	return True


def enqueue_link(link: str) -> None:
	frappe.db.after_commit.add(partial(enqueue_committed, link))


def enqueue_committed(link: str) -> None:
	try:
		frappe.enqueue(
			"setu.github.worker.process_link",
			link=link,
			queue="default",
			timeout=900,
			job_id=f"envision-github-link-{link}",
			deduplicate=True,
		)
	except Exception:
		# The operation stays open; setu.github.recovery enqueues it again.
		frappe.logger("envision.github").warning("GitHub sync queue unavailable; recovery will retry.")


def backoff(attempts: int) -> datetime:
	seconds = min(60 * 2**attempts, MAX_BACKOFF_SECONDS) * random.uniform(0.8, 1.2)
	return add_to_date(now_datetime(), seconds=int(seconds))


def cancel_ops(links: Iterable[str], kinds: Iterable[OpKind] | None = None) -> None:
	names = list(links)
	if not names:
		return
	table = frappe.qb.DocType(OPERATION)
	query = (
		frappe.qb.update(table)
		.set(table.status, "Cancelled")
		.set(table.open_key, None)
		.set(table.modified, now_datetime())
		.where(table.link.isin(names))
		.where(table.status.isin(OPEN_OPS))
	)
	if kinds is not None:
		query = query.where(table.kind.isin(list(kinds)))
	query.run()


def requeue_waiting(links: Iterable[str]) -> None:
	"""Release operations held while a link or its route was paused."""
	names = list(links)
	if not names:
		return
	table = frappe.qb.DocType(OPERATION)
	(
		frappe.qb.update(table)
		.set(table.status, "Queued")
		.set(table.retry_at, None)
		.where(table.link.isin(names))
		.where(table.status == "Waiting")
	).run()
	for name in names:
		enqueue_link(name)


def retry_ops(link: str) -> int:
	"""Give a link's failed operations a fresh attempt budget.

	An operation is reopened only if no open one of its kind exists; an
	uncertain create still looks for its Issue first (setu.github.outbound).
	"""
	retried = 0
	for row in frappe.get_all(
		OPERATION,
		filters={"link": link, "status": "Error"},
		fields=["name", "kind"],
		order_by="creation desc",
	):
		key = f"{link}:{row.kind}"
		if frappe.db.exists(OPERATION, {"open_key": key}):
			frappe.db.set_value(OPERATION, row.name, "status", "Cancelled")
			continue
		frappe.db.set_value(
			OPERATION,
			row.name,
			{"status": "Queued", "open_key": key, "attempts": 0, "retry_at": None, "error": None},
		)
		retried += 1
	# Waiting and backing-off operations run now as well.
	table = frappe.qb.DocType(OPERATION)
	(
		frappe.qb.update(table)
		.set(table.status, "Queued")
		.set(table.retry_at, None)
		.where(table.link == link)
		.where(table.status.isin(["Waiting", "Retrying"]))
	).run()
	enqueue_link(link)
	return retried


def has_open_ops(link: str) -> bool:
	return bool(frappe.db.exists(OPERATION, {"link": link, "status": ["in", list(OPEN_OPS)]}))


def pause_links(filters: dict[str, str | list[str | list[str]]], reason: PauseReason) -> list[str]:
	"""Pause the matching active links. Already paused links keep their reason,
	so lifting a route-level pause never resumes a link a user paused."""
	names = frappe.get_all(
		ISSUE_SYNC,
		filters={**filters, "sync_state": ["in", list(ACTIVE_STATES)]},
		pluck="name",
	)
	for name in names:
		frappe.db.set_value(ISSUE_SYNC, name, {"sync_state": "Paused", "paused_reason": reason})
	return names


def delete_project_links(project: str) -> None:
	"""Project deletion (only possible with no Tasks): its links are tombstones
	or unfinished imports, and would otherwise block the delete."""
	links = frappe.get_all(ISSUE_SYNC, filters={"project": project}, pluck="name")
	frappe.db.delete(OPERATION, {"project": project})
	if links:
		frappe.db.delete(OPERATION, {"link": ["in", links]})
		frappe.db.delete(SYNC_CONFLICT, {"parenttype": ISSUE_SYNC, "parent": ["in", links]})
		frappe.db.delete(ISSUE_SYNC, {"name": ["in", links]})


def link_lock(link: str):
	"""Serializes all GitHub work on one link across workers."""
	return frappe.cache.lock(
		frappe.cache.make_key(f"envision:github:link:{link}"), timeout=900, blocking_timeout=60
	)


def issue_lock(issue_id: str):
	"""Serializes work on an Issue before it has a link."""
	return frappe.cache.lock(
		frappe.cache.make_key(f"envision:github:issue:{issue_id}"), timeout=300, blocking_timeout=30
	)


def log_safe(exc: BaseException, title: str, reference_doctype: str, reference_name: str | None) -> None:
	# Frappe log_error defaults to tracebacks WITH LOCAL VARIABLES, which may
	# hold Issue content or tokens. Keep source locations and the type only.
	frames = traceback.extract_tb(exc.__traceback__)
	diagnostic = "\n".join(f"{frame.filename}:{frame.lineno} in {frame.name}" for frame in frames)
	diagnostic += f"\n{type(exc).__name__}"
	try:
		frappe.log_error(
			title=title,
			message=diagnostic,
			reference_doctype=reference_doctype,
			reference_name=reference_name,
		)
	except Exception:
		frappe.logger("envision.github").error("Could not persist GitHub sync diagnostics.")


def error_text(exc: BaseException) -> str:
	"""A message safe to store, for Frappe validation errors and GitHubError
	only: unexpected exceptions get a generic message from their caller."""
	message = strip_html(str(exc)).strip()
	return message[:500] if message else "Envision could not complete this sync step."
