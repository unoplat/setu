"""The webhook endpoint: connection health, installation lifecycle, Issues and
their comments.

``installation`` and ``installation_repositories`` events keep their durable
receipt (Envision GitHub Delivery) and are processed by a job. Other events
without a flow, ``ping`` among them, leave a closed receipt.

``issues``, ``sub_issues`` and ``issue_comment`` events write no receipt. They
pass the gates here (setu.github.inbound takes it from there), so anything stopped
by a gate stores nothing; a redelivered event just runs again, because every
handler re-reads GitHub's current state. A comment on a pull request is
acknowledged and dropped: only Issues are synced.
"""

import json
import re
import traceback
from functools import partial
from uuid import UUID

import frappe
from frappe.utils import add_to_date, now_datetime
from githubkit.webhooks import verify

from setu.github import (
	client,
	comments,
	connection,
	convert,
	delta,
	inbound,
	link_state,
	links,
	outbound,
	projects,
	retry,
	store,
)
from setu.github.client import GitHubError, JSONValue

MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_ATTEMPTS = 5
LIFECYCLE_EVENTS = frozenset({"installation", "installation_repositories"})
ISSUE_EVENTS = frozenset({delta.ISSUE_EVENT, delta.SUB_ISSUE_EVENT, delta.COMMENT_EVENT})
NUMERIC_ID = re.compile(r"\d{1,30}")


def receive() -> dict[str, bool]:
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
	if not installation_id and (event in LIFECYCLE_EVENTS or event in ISSUE_EVENTS):
		return reply(400, accepted=False)
	if event in ISSUE_EVENTS:
		return receive_issue_event(event, action, payload, installation_id)
	return store_receipt(delivery_id, doc.app_id, event, action, installation_id)


def store_receipt(
	delivery_id: str, app_id: str, event: str, action: str, installation_id: str
) -> dict[str, bool]:
	"""Record a delivery, and queue a lifecycle event for processing."""
	lifecycle = event in LIFECYCLE_EVENTS
	status = "Queued" if lifecycle else "Processed" if event == "ping" else "Ignored"
	# Uniqueness is the dedupe gate, not a racy exists-then-insert check. The
	# savepoint lets a duplicate be acknowledged without poisoning the transaction.
	frappe.db.savepoint("github_delivery")
	try:
		frappe.get_doc(
			{
				"doctype": connection.DELIVERY,
				"name": delivery_id,
				"app_id": app_id,
				"event": event,
				"action": action,
				"installation_id": installation_id,
				"status": status,
				"processed_at": None if lifecycle else now_datetime(),
			}
		).insert(ignore_permissions=True)
	except frappe.DuplicateEntryError:
		frappe.db.rollback(save_point="github_delivery")
		existing = frappe.db.get_value(
			connection.DELIVERY, delivery_id, ["status", "app_id"], as_dict=True, for_update=True
		)
		if existing and existing.status == "Failed" and existing.app_id == app_id:
			# An explicit GitHub redelivery can retry even an exhausted receipt.
			# Processing/finished receipts are never reset or processed twice.
			frappe.db.set_value(
				connection.DELIVERY,
				delivery_id,
				{"status": "Queued", "attempts": 0, "error": None, "processed_at": None},
			)
			enqueue(delivery_id)
		return reply(200, accepted=True, duplicate=True)
	if lifecycle:
		enqueue(delivery_id)
	return reply(202, accepted=True)


def receive_issue_event(
	event: str, action: str, payload: dict[str, JSONValue], installation_id: str
) -> dict[str, bool]:
	"""The gates of GitHub → Envision 1, in order. Each one that stops the event
	replies 200 and stores nothing. A database or Redis outage in any of them is not
	caught: it reaches GitHub as a 5xx, and the redelivery cron gets the event back."""
	if event == delta.COMMENT_EVENT and on_pull_request(payload):
		return reply(200, accepted=True)
	target = issue_target(event, payload)
	comment_id = comment_identifier(payload) if event == delta.COMMENT_EVENT else None
	if target is None or (event == delta.COMMENT_EVENT and comment_id is None):
		return reply(400, accepted=False)
	if not routed(str(target["repository_id"]), installation_id):
		return reply(200, accepted=True)
	link = links.link_for_issue(str(target["issue_id"]))
	if links.in_other_project(link, str(target["repository_id"])):
		return reply(200, accepted=True)
	deleted = event == delta.ISSUE_EVENT and action == "deleted"
	if link and not link_state.accepts_webhook(link.sync_state, issue_deleted=deleted):
		return reply(200, accepted=True)
	if not deleted and sent_by_app_bot(payload.get("sender")):
		if event == delta.ISSUE_EVENT and action == "opened":
			fill_created_issue(target, payload)
		if event == delta.COMMENT_EVENT and action == "created" and link:
			fill_created_comment(link.name, payload)
		return reply(200, accepted=True)
	if deleted and link and link.sync_state == link_state.TO_BE_DELETED:
		finish_pending_delete(link.name)
		return reply(200, accepted=True)
	if deleted and not link:
		end_pending_import(target)
		return reply(200, accepted=True)
	changes = payload.get("changes")
	if event == delta.ISSUE_EVENT and action == "edited" and not isinstance(changes, dict):
		return reply(400, accepted=False)
	entries = delta.webhook_delta(
		event,
		action,
		linked=bool(link),
		comment_id=comment_id,
		changed_fields=tuple(changes) if isinstance(changes, dict) else (),
	)
	if entries:
		inbound.apply_or_queue(target, entries, link, sender_login(payload.get("sender")))
	return reply(200, accepted=True)


def issue_target(event: str, payload: dict[str, JSONValue]) -> dict[str, str | int] | None:
	"""The Issue an event's delta belongs to, as a Retry Job target; None if malformed.

	An issue_comment belongs to the Issue it was written on. A sub_issues event belongs to the child. Its payload names each side's
	repository (``sub_issue_repo``/``parent_issue_repo``): ``repository`` is the side
	the event was sent for, the parent's for sub_issue_added/removed and the
	child's for parent_issue_added/removed.
	"""
	repository = payload.get("repository")
	if event in (delta.ISSUE_EVENT, delta.COMMENT_EVENT):
		issue = payload.get("issue")
		issue_id = identifier(issue.get("id")) if isinstance(issue, dict) else None
	else:
		issue = payload.get("sub_issue")
		named_id = payload.get("sub_issue_id")
		issue_id = identifier(named_id or issue.get("id")) if isinstance(issue, dict) else None
		child_repository = payload.get("sub_issue_repo")
		repository = child_repository if isinstance(child_repository, dict) else repository
	repository_id = identifier(repository.get("id")) if isinstance(repository, dict) else None
	issue_number = number(issue.get("number")) if isinstance(issue, dict) else None
	if not repository_id or not issue_id or not issue_number:
		return None
	return {"repository_id": repository_id, "issue_id": issue_id, "issue_number": issue_number}


def on_pull_request(payload: dict[str, JSONValue]) -> bool:
	"""An issue_comment written on a pull request, which GitHub also sends: its
	``issue`` carries a ``pull_request`` object."""
	issue = payload.get("issue")
	return isinstance(issue, dict) and isinstance(issue.get("pull_request"), dict)


def comment_identifier(payload: dict[str, JSONValue]) -> str | None:
	"""The GitHub id of an issue_comment event's comment; None if malformed."""
	comment = payload.get("comment")
	return identifier(comment.get("id")) if isinstance(comment, dict) else None


def routed(repository_id: str, installation_id: str) -> bool:
	"""The repository is routed to a Project through the installation that sent the
	event, and that Project's sync is on. An unconfirmed site binding does not stop
	it here: that event waits in a Retry Job row."""
	route = projects.route_for(repository=repository_id)
	row = route["repository_row"] if route else None
	return bool(route and route["sync_enabled"] and row and str(row.installation) == installation_id)


def sent_by_app_bot(sender: JSONValue) -> bool:
	"""Whether this site's app bot sent the event: its own write coming back."""
	if not isinstance(sender, dict):
		return False
	login = outbound.app_login()
	return bool(login) and sender.get("login") == login and sender.get("type") == "Bot"


def sender_login(sender: JSONValue) -> str | None:
	"""Who sent the event, for the Activity comment of a change applied straight away."""
	login = sender.get("login") if isinstance(sender, dict) else None
	return login if isinstance(login, str) and login else None


def fill_created_issue(target: dict[str, str | int], payload: dict[str, JSONValue]) -> None:
	"""The bot's own issues.opened: give the marker's link its Issue, if the create
	hasn't recorded one yet, so a create whose response was lost finds it there
	(``outbound.ensure_created``). Never imports, and never replaces an Issue.
	"""
	issue = payload.get("issue")
	if not isinstance(issue, dict):
		return
	body, node_id, url = issue.get("body"), issue.get("node_id"), issue.get("html_url")
	marker = convert.find_marker(body) if isinstance(body, str) else None
	if not marker or not isinstance(node_id, str) or not isinstance(url, str):
		return
	identity: dict[str, str | int] = {
		"repository_provider_issue_id": target["issue_id"],
		"issue_node_id": node_id,
		"issue_number": target["issue_number"],
		"issue_url": url,
	}
	links.fill_issue_identity(marker, str(target["repository_id"]), identity)


def fill_created_comment(link_name: str, payload: dict[str, JSONValue]) -> None:
	"""The bot's own issue_comment.created: give the marker's row its GitHub comment, if
	the create hasn't recorded one yet, so a create whose response was lost finds it
	there (``comments.ensure_created``). Never imports."""
	comments.fill_created(link_name, payload.get("comment"))


def finish_pending_delete(link_name: str) -> None:
	"""A signed issues.deleted on a to_be_deleted link, from any sender: the Issue has
	gone, so the link and its Retry Job rows go too. Nothing else is deleted.

	A link still holding its Task is a refused delete of that Task, which is retrying:
	its row is the only thing left that will delete the Task, so it stays."""
	link = links.locked_link(link_name)
	if link and link.sync_state == link_state.TO_BE_DELETED and not link.task:
		links.delete_link(link)


def end_pending_import(target: dict[str, str | int]) -> None:
	"""A signed issues.deleted with no link. An Issue is never imported in order to
	delete it, so with no row nothing is stored. A row is an import still waiting, which
	would otherwise get a 404 on every retry: ``issue: delete`` replaces its keys, and
	finishes with no link to act on."""
	job_key = delta.inbound_job_key(str(target["repository_id"]), str(target["issue_id"]))
	retry.merge_into_row(job_key, {delta.ISSUE_RESOURCE: delta.DELETE}, None)


def identifier(value: JSONValue) -> str | None:
	text = str(value) if isinstance(value, int) and not isinstance(value, bool) else None
	return text if text and NUMERIC_ID.fullmatch(text) else None


def number(value: JSONValue) -> int | None:
	return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def reply(status: int, **values: bool) -> dict[str, bool]:
	frappe.local.response["http_status_code"] = status
	return values


def enqueue(delivery_id: str) -> None:
	# Queue publication is best effort AFTER the receipt commits. A durable
	# scheduler scan recovers a queue outage without losing the original receipt.
	frappe.db.after_commit.add(partial(_enqueue_committed, delivery_id))


def _enqueue_committed(delivery_id: str) -> None:
	try:
		frappe.enqueue(
			"setu.github.events.process_delivery",
			delivery_id=delivery_id,
			queue="long",
			timeout=600,
			job_id=f"envision-github-{delivery_id}",
			deduplicate=True,
		)
	except Exception:
		# No credentials/payload are logged. retry_pending_deliveries enqueues it again.
		frappe.logger("envision.github").warning(
			"GitHub delivery queue unavailable; the scheduled retry will enqueue it."
		)


def process_delivery(delivery_id: str):
	# Serialize connection mutation with browser callbacks and manual refresh.
	with connection.connection_lock():
		doc = frappe.get_doc(connection.DELIVERY, delivery_id)
		if doc.status in ("Processed", "Ignored", "Deferred") or doc.event not in LIFECYCLE_EVENTS:
			return
		if not client.settings().app_id or doc.app_id != client.settings().app_id:
			doc.status = "Ignored"
			doc.error = "This delivery belongs to a disconnected app."
		else:
			doc.status = "Processing"
			doc.attempts += 1
			doc.save(ignore_permissions=True)
			# Keep the attempt durable even if this worker dies during the GitHub request.
			frappe.db.commit()  # nosemgrep: frappe-manual-commit
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
		# Publish connection changes before releasing the shared Redis connection lock.
		frappe.db.commit()  # nosemgrep: frappe-manual-commit


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
		filters = {
			"status": status,
			"attempts": ["<", MAX_ATTEMPTS],
			"event": ["in", list(LIFECYCLE_EVENTS)],
		}
		if status == "Processing":
			filters["modified"] = ["<", cutoff]
		for name in frappe.get_all(connection.DELIVERY, filters=filters, pluck="name", limit_page_length=50):
			_enqueue_committed(name)
