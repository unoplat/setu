"""Durable webhook receipts: connection health, installation lifecycle and Issues.

Issue and sub-issue receipts keep identifiers only (repository, Issue,
parent, actor), never titles, bodies or payloads. A receipt is Queued when
its repository's Project is syncing, Deferred while that Project's sync is
off, paused or blocked, and Ignored when no Project uses the repository or
another installation owns it. setu.github.inbound processes Issue receipts.
"""

import json
import re
import traceback
from functools import partial
from typing import TypedDict
from uuid import UUID

import frappe
from frappe.utils import add_to_date, now_datetime
from githubkit.webhooks import verify

from setu.github import client, connection, projects
from setu.github.client import GitHubError, JSONValue

MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_ATTEMPTS = 5
LIFECYCLE_EVENTS = {"installation", "installation_repositories"}
ISSUE_EVENTS = {"issues", "sub_issues"}
NUMERIC_ID = re.compile(r"\d{1,30}")


class IssueReceipt(TypedDict):
	repository_id: str
	issue_id: str
	issue_number: int | None
	related_issue_id: str | None
	related_issue_number: int | None
	related_repository_id: str | None
	actor_login: str | None


def receive() -> dict:
	doc = client.settings()
	secret = doc.get_password("webhook_secret", raise_exception=False) if doc.app_id else None
	if not secret:
		return reply(401, accepted=False)
	if (frappe.request.content_length or 0) > MAX_BODY_BYTES:
		return reply(413, accepted=False)
	raw = frappe.request.get_data()
	if len(raw) > MAX_BODY_BYTES:
		return reply(413, accepted=False)
	signature = frappe.get_request_header("X-Hub-Signature-256") or ""
	if (
		not re.fullmatch(r"sha256=[0-9a-f]{64}", signature)
		or not isinstance(secret, str)
		or not verify(secret, raw, signature)
	):
		return reply(401, accepted=False)
	try:
		delivery_id = str(UUID(frappe.get_request_header("X-GitHub-Delivery") or ""))
		payload = json.loads(raw)
		if not isinstance(payload, dict):
			raise ValueError
	except ValueError, TypeError:
		return reply(400, accepted=False)
	event = frappe.get_request_header("X-GitHub-Event") or ""
	action = payload.get("action") or ""
	if not isinstance(action, str) or not re.fullmatch(r"[a-z_]{1,80}", event) or len(action) > 80:
		return reply(400, accepted=False)
	installation = payload.get("installation") or {}
	if not isinstance(installation, dict):
		return reply(400, accepted=False)
	installation_id = str(installation.get("id") or "")
	if installation_id and not re.fullmatch(r"\d{1,30}", installation_id):
		return reply(400, accepted=False)
	# Installations on another app/owner must never alter this site's connection.
	account = installation.get("account") or {}
	if not isinstance(account, dict):
		return reply(400, accepted=False)
	if event == "installation" and (
		str(installation.get("app_id")) != doc.app_id or str(account.get("id")) != doc.owner_id
	):
		return reply(403, accepted=False)
	if event in LIFECYCLE_EVENTS and not installation_id:
		return reply(400, accepted=False)
	receipt: IssueReceipt | None = None
	if event in ISSUE_EVENTS:
		receipt = issue_receipt(event, payload)
		if not installation_id or receipt is None:
			return reply(400, accepted=False)
	if event in LIFECYCLE_EVENTS:
		status, error = "Queued", None
	elif receipt is not None:
		status, error = issue_status(receipt, installation_id)
	else:
		status, error = ("Processed" if event == "ping" else "Ignored"), None

	# Uniqueness is the dedupe gate, not a racy exists-then-insert check. The
	# savepoint lets a duplicate be acknowledged without poisoning the transaction.
	frappe.db.savepoint("github_delivery")
	try:
		frappe.get_doc(
			{
				"doctype": connection.DELIVERY,
				"name": delivery_id,
				"app_id": doc.app_id,
				"event": event,
				"action": action,
				"installation_id": installation_id,
				"status": status,
				"processed_at": None if status == "Queued" else now_datetime(),
				"error": error,
				**(receipt or {}),
			}
		).insert(ignore_permissions=True)
	except frappe.DuplicateEntryError:
		frappe.db.rollback(save_point="github_delivery")
		existing = frappe.db.get_value(
			connection.DELIVERY, delivery_id, ["status", "app_id", "event"], as_dict=True, for_update=True
		)
		if existing and existing.status == "Failed" and existing.app_id == doc.app_id:
			# An explicit GitHub redelivery can retry even an exhausted receipt.
			# Processing/finished receipts are never reset or processed twice.
			frappe.db.set_value(
				connection.DELIVERY,
				delivery_id,
				{"status": "Queued", "attempts": 0, "error": None, "processed_at": None},
			)
			enqueue(delivery_id, existing.event)
		return reply(200, accepted=True, duplicate=True)
	if status == "Queued":
		enqueue(delivery_id, event)
	return reply(202, accepted=True)


def issue_receipt(event: str, payload: dict[str, JSONValue]) -> IssueReceipt | None:
	"""The identifiers an Issue event needs, checked; None if malformed.

	sub_issues payloads name the sub-issue and its parent, each with its
	repository (``sub_issue``/``parent_issue``, ``sub_issue_repo``/
	``parent_issue_repo``); the delivery records the sub-issue as its Issue.
	"""
	sender = payload.get("sender")
	actor = sender.get("login") if isinstance(sender, dict) else None
	actor = actor if isinstance(actor, str) and len(actor) <= 100 else None
	repository = payload.get("repository")
	if event == "issues":
		issue = payload.get("issue")
		if not isinstance(issue, dict):
			return None
		repository_id = identifier(repository.get("id") if isinstance(repository, dict) else None)
		issue_id = identifier(issue.get("id"))
		if not repository_id or not issue_id:
			return None
		return {
			"repository_id": repository_id,
			"issue_id": issue_id,
			"issue_number": number(issue.get("number")),
			"related_issue_id": None,
			"related_issue_number": None,
			"related_repository_id": None,
			"actor_login": actor,
		}
	sub_issue = payload.get("sub_issue")
	parent = payload.get("parent_issue")
	if not isinstance(sub_issue, dict) or not isinstance(parent, dict):
		return None
	# Each payload names the other side's repository; ``repository`` is the
	# side the event was sent for (the parent's for sub_issue_added/removed,
	# the sub-issue's for parent_issue_added/removed).
	sub_repository = payload.get("sub_issue_repo")
	parent_repository = payload.get("parent_issue_repo")
	source = sub_repository if isinstance(sub_repository, dict) else repository
	parent_source = parent_repository if isinstance(parent_repository, dict) else repository
	repository_id = identifier(source.get("id")) if isinstance(source, dict) else None
	parent_repository_id = identifier(parent_source.get("id")) if isinstance(parent_source, dict) else None
	issue_id = identifier(payload.get("sub_issue_id") or sub_issue.get("id"))
	parent_id = identifier(payload.get("parent_issue_id") or parent.get("id"))
	if not repository_id or not issue_id or not parent_id:
		return None
	return {
		"repository_id": repository_id,
		"issue_id": issue_id,
		"issue_number": number(sub_issue.get("number")),
		"related_issue_id": parent_id,
		"related_issue_number": number(parent.get("number")),
		"related_repository_id": parent_repository_id or repository_id,
		"actor_login": actor,
	}


def identifier(value: JSONValue) -> str | None:
	text = str(value) if isinstance(value, int) and not isinstance(value, bool) else None
	return text if text and NUMERIC_ID.fullmatch(text) else None


def number(value: JSONValue) -> int | None:
	return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def issue_status(receipt: IssueReceipt, installation_id: str) -> tuple[str, str | None]:
	"""Queued for a syncing Project, Deferred while it is not, Ignored when no
	Project uses the repository through this installation."""
	route = projects.route_for(repository=receipt["repository_id"])
	row = route["repository_row"] if route else None
	if not route or not row or str(row.installation) != installation_id:
		return "Ignored", "This repository is not connected to a project."
	blocker = projects.sync_blocker(route)
	if blocker:
		return "Deferred", projects.inactive_message(blocker)
	return "Queued", None


def reply(status: int, **values) -> dict:
	frappe.local.response["http_status_code"] = status
	return values


def enqueue(delivery_id: str, event: str):
	# Queue publication is best effort AFTER the receipt commits. A durable
	# scheduler scan recovers a queue outage without losing the original receipt.
	frappe.db.after_commit.add(partial(_enqueue_committed, delivery_id, event))


def _enqueue_committed(delivery_id: str, event: str):
	# Issue receipts never take the connection lock lifecycle receipts hold.
	method = (
		"setu.github.inbound.process_issue_delivery"
		if event in ISSUE_EVENTS
		else "setu.github.events.process_delivery"
	)
	try:
		frappe.enqueue(
			method,
			delivery_id=delivery_id,
			queue="long",
			timeout=600,
			job_id=f"envision-github-{delivery_id}",
			deduplicate=True,
		)
	except Exception:
		# No credentials/payload are logged. Receipt stays Queued for recovery.
		frappe.logger("envision.github").warning(
			"GitHub delivery queue unavailable; scheduled recovery will retry."
		)


def process_delivery(delivery_id: str):
	# Serialize connection mutation with browser callbacks and manual refresh.
	with connection.connection_lock():
		doc = frappe.get_doc(connection.DELIVERY, delivery_id)
		if doc.status in ("Processed", "Ignored", "Deferred") or doc.event in ISSUE_EVENTS:
			return
		if not client.settings().app_id or doc.app_id != client.settings().app_id:
			doc.status = "Ignored"
			doc.error = "This delivery belongs to a disconnected app."
		else:
			doc.status = "Processing"
			doc.attempts += 1
			doc.save(ignore_permissions=True)
			frappe.db.commit()
			try:
				if doc.event == "installation" and doc.action == "deleted":
					connection.remove_installation(doc.installation_id)
				else:
					# Read canonical installation/repository state rather than replaying
					# stale payloads. This also handles all → selected repository changes.
					try:
						connection.sync_installation(doc.installation_id)
					except GitHubError as exc:
						if exc.status != 404:
							raise
						connection.remove_installation(doc.installation_id)
				doc.status = "Processed"
				doc.error = None
			except Exception as exc:
				frappe.db.rollback()
				if not isinstance(exc, GitHubError):
					log_processing_error(exc, delivery_id)
				doc.status = "Failed"
				doc.error = (
					str(exc)
					if isinstance(exc, GitHubError)
					else "Connection refresh failed. Retry from GitHub Settings."
				)
		doc.processed_at = now_datetime()
		doc.save(ignore_permissions=True)
		frappe.db.commit()


def log_processing_error(exc: Exception, delivery_id: str):
	# Frappe log_error defaults to tracebacks WITH LOCAL VARIABLES. Do not use
	# that default: API results, tokens and keys may be present in stack frames.
	# Retain only source locations and exception type, not values or messages.
	frames = traceback.extract_tb(exc.__traceback__)
	diagnostic = "\n".join(f"{frame.filename}:{frame.lineno} in {frame.name}" for frame in frames)
	diagnostic += f"\n{type(exc).__name__}: unexpected GitHub connection processing error"
	try:
		frappe.log_error(
			title="GitHub delivery processing failed",
			message=diagnostic,
			reference_doctype=connection.DELIVERY,
			reference_name=delivery_id,
		)
	except Exception:
		frappe.logger("envision.github").error(
			"Could not persist diagnostics for GitHub delivery %s", delivery_id
		)


def retry_pending_deliveries():
	"""Recover missing queue publication, crashed workers, and transient failures."""
	cutoff = add_to_date(now_datetime(), minutes=-15)
	for status in ("Queued", "Failed", "Processing"):
		filters = {"status": status, "attempts": ["<", MAX_ATTEMPTS]}
		if status == "Processing":
			filters["modified"] = ["<", cutoff]
		for row in frappe.get_all(
			connection.DELIVERY, filters=filters, fields=["name", "event"], limit_page_length=50
		):
			_enqueue_committed(row.name, row.event)
