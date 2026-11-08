"""Durable Task ↔ Issue links: the record names and the writes every sync flow shares.

A link (Envision GitHub Issue Sync) is one Task's identity on GitHub. Nothing here
calls GitHub, and this module imports no other sync module but the pure ``delta``, so
routing, connection and Task hooks can all use it.
"""

import traceback
from collections.abc import Callable
from datetime import datetime
from typing import TYPE_CHECKING

import frappe
from frappe.utils import strip_html

from setu.github import delta

if TYPE_CHECKING:
	from redis.lock import Lock

ISSUE_SYNC = "Envision GitHub Issue Sync"
COMMENT_SYNC = "Envision GitHub Comment Sync"
RETRY_JOB = "Envision Retry Job"
# Records naming a Task that never block deleting it: the Task's on_trash hook
# clears the name or deletes the row (setu.github.links.on_task_trash).
GITHUB_LINK_DOCTYPES = frozenset({ISSUE_SYNC, RETRY_JOB})
# A big Task tree deletes under this lock, from the retry cron: as long as that lets
# one row run (setu.retry_jobs.ROW_LIMIT_SECONDS). Every other holder lets go in seconds.
ISSUE_LOCK_SECONDS = 1800
# Starts the part of a sync failure's Error Log that is safe to show (``logged_detail``).
DETAIL_PREFIX = "Detail: "


def insert_unique(values: dict[str, str | int | datetime | None]) -> str | None:
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


def delete_project_links(project: str) -> None:
	"""Project deletion (only possible with no Tasks): every link, unlinked ones too,
	and their Retry Job rows go, and the Issues stay on GitHub. A link would otherwise
	block the delete. The caller refuses it first if it has to
	(``setu.github.projects.delete_project_route``)."""
	links = frappe.get_all(
		ISSUE_SYNC,
		filters={"project": project},
		fields=["name", "repository_id", "repository_provider_issue_id"],
		order_by="name asc",
	)
	if not links:
		return
	jobs = retry_job_names(links)
	names = [link.name for link in links]
	delete_comment_links(names)
	frappe.db.delete(ISSUE_SYNC, {"name": ["in", names]})
	if jobs:
		frappe.db.delete(RETRY_JOB, {"name": ["in", jobs]})


def delete_comment_links(link_names: list[str]) -> None:
	"""The comment identities of these links, which go with them. Comments stay on both sides."""
	if link_names:
		frappe.db.delete(COMMENT_SYNC, {"issue_sync": ["in", link_names]})


def retry_job_names(links: list[frappe._dict]) -> list[str]:
	"""These links' Retry Job rows in both directions. An outbound row is found by
	``target.link``, because its key keeps a deleted Task's name."""
	names = {link.name for link in links}
	outbound = frappe.get_all(
		RETRY_JOB,
		filters={"job_key": ["like", f"{delta.OUTBOUND_KEY_PREFIX}%"]},
		fields=["name", "target"],
	)
	return [
		*(row.name for row in outbound if (delta.parse_object(row.target) or {}).get("link") in names),
		*(
			delta.inbound_job_key(link.repository_id, link.repository_provider_issue_id)
			for link in links
			if link.repository_id and link.repository_provider_issue_id
		),
	]


def link_lock(link: str):
	"""Serializes all GitHub work on one link across workers."""
	return frappe.cache.lock(
		frappe.cache.make_key(f"envision:github:link:{link}"), timeout=900, blocking_timeout=60
	)


def link_lock_nowait(link: str):
	"""``link_lock`` for a caller that must not wait: the same lock, and entering
	it raises redis-py's LockError straight away when it is held."""
	return frappe.cache.lock(
		frappe.cache.make_key(f"envision:github:link:{link}"), timeout=900, blocking=False
	)


def issue_lock_nowait(issue_id: str) -> Lock:
	"""Serializes GitHub → Envision work on one Issue, which may have no link yet. It
	never waits: ``acquire()`` returns False straight away when it is held."""
	return frappe.cache.lock(
		frappe.cache.make_key(f"envision:github:issue:{issue_id}"), timeout=ISSUE_LOCK_SECONDS, blocking=False
	)


def log_safe(
	exc: BaseException,
	title: str,
	reference_doctype: str,
	reference_name: str | None,
	*,
	detail: str | None = None,
) -> str | None:
	"""Write an Error Log and return its name, or None if it could not be written.
	``detail`` must already be safe to store (``error_text``)."""
	# Frappe log_error defaults to tracebacks WITH LOCAL VARIABLES, which may
	# hold Issue content or tokens. Keep source locations and the type only.
	frames = traceback.extract_tb(exc.__traceback__)
	diagnostic = "\n".join(f"{frame.filename}:{frame.lineno} in {frame.name}" for frame in frames)
	diagnostic += f"\n{type(exc).__name__}"
	if detail:
		diagnostic += f"\n{DETAIL_PREFIX}{detail}"
	try:
		log = frappe.log_error(
			title=title,
			message=diagnostic,
			reference_doctype=reference_doctype,
			reference_name=reference_name,
		)
	except Exception:
		frappe.logger("envision.github").error("Could not persist GitHub sync diagnostics.")
		return None
	return log.name if log else None


def logged_detail(error_log: str) -> str | None:
	"""The ``detail`` an Error Log from ``log_safe`` holds, the only part of it for anyone
	but a System Manager. None when it has none, or the log has been cleared away."""
	text = frappe.db.get_value("Error Log", error_log, "error") or ""
	return text.partition(f"\n{DETAIL_PREFIX}")[2].strip() or None


def error_text(exc: BaseException) -> str:
	"""A message safe to store, for Frappe validation errors and GitHubError
	only: unexpected exceptions get a generic message from their caller."""
	message = strip_html(str(exc)).strip()
	return message[:500] if message else "Envision could not complete this sync step."
