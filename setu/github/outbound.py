"""Envision → GitHub: creating a Task's Issue, safe to retry after an unknown outcome.

GitHub has no idempotent Issue create. Each link has an opaque marker, kept in
the Issue body as a hidden HTML comment. The create records when it was
sent, on its operation and on the link, and commits that BEFORE sending. If
the outcome is then unknown (a timeout, a dropped connection, a server error,
or a worker that died mid-request), every later attempt, from this operation
or any later one, first looks for an Issue the app created with that marker
since then. A new create is sent only after ``MIN_LOOKUPS`` lookups spread
over ``LOOKUP_WINDOW`` find nothing, never blindly.
"""

from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime

from setu.github import client, clock, connection, convert, issues, links, store, titles
from setu.github.client import GitHubError
from setu.github.convert import IssueBody
from setu.github.issues import IssueData

MIN_LOOKUPS = 3
LOOKUP_WINDOW = timedelta(minutes=10)
LOOKUP_INTERVAL_MINUTES = 2
LOOKUP_PAGES = 5
# GitHub's title limit, in characters.
MAX_TITLE_LENGTH = 256


def create_issue(link_name: str, op_name: str) -> store.Outcome:
	link = frappe.get_doc(store.ISSUE_SYNC, link_name)
	if link.issue_id:
		return store.outcome("Done")
	if link.sync_state in ("Disconnected", "Tombstoned") or not link.task:
		return store.outcome("Cancelled")
	if link.sync_state == "Paused":
		return store.outcome("Waiting")
	found, blocker = links.target(link)
	if blocker or not found:
		return links.blocked(link_name, blocker or "not_connected")
	task = frappe.get_doc("Task", link.task)
	if task.project != link.project:
		store.pause_links({"name": link_name}, "project_changed")
		return store.outcome("Waiting")
	if links.ineligible_reason(task):
		store.pause_links({"name": link_name}, "task_ineligible")
		return store.outcome("Waiting")

	op = frappe.db.get_value(store.OPERATION, op_name, ["request_started_at", "lookups"], as_dict=True)
	# The link keeps the time too, so a create sent by an earlier operation
	# (cancelled by a disconnect, or cleared from the log) is still looked for.
	started = op.request_started_at or link.create_requested_at
	if started:
		issue = find_created(found, link.create_marker, started)
		if issue:
			record_created(link_name, task, issue)
			return store.outcome("Done")
		lookups = (op.lookups or 0) + 1
		frappe.db.set_value(
			store.OPERATION,
			op_name,
			{"request_started_at": started, "lookups": lookups},
			update_modified=False,
		)
		if lookups < MIN_LOOKUPS or now_datetime() - started < LOOKUP_WINDOW:
			return store.outcome(
				"Uncertain",
				retry_at=add_to_date(now_datetime(), minutes=LOOKUP_INTERVAL_MINUTES),
				error=_("GitHub may have created this Issue. Envision is checking before trying again."),
			)
		# Looked up enough, over long enough: the earlier create did not happen.

	# The Task's whole title, never shortened. No title of this link has
	# synced yet, so only a note Envision marked continues it.
	title = titles.title(task.subject, task.description, False)
	if len(title) > MAX_TITLE_LENGTH:
		return store.outcome(
			"Error",
			error=_(
				"This task's title, with its GitHub title continuation, is {0} characters; GitHub allows {1}. Shorten it to publish."
			).format(len(title), MAX_TITLE_LENGTH),
		)
	body = body_for(link.create_marker, titles.content(task.description, False), None)
	if body["lossy"]:
		# Publish the title, not a silently flattened description. Keep the
		# original locally and let the resulting conflict request explicit
		# consent before any lossy Markdown is sent to GitHub.
		body = {**body, "body": convert.add_marker("", link.create_marker), "changed": True}
	sent_at = now_datetime()
	frappe.db.set_value(
		store.OPERATION, op_name, {"request_started_at": sent_at, "lookups": 0}, update_modified=False
	)
	frappe.db.set_value(store.ISSUE_SYNC, link_name, "create_requested_at", sent_at, update_modified=False)
	frappe.db.commit()
	try:
		issue = issues.create_issue(
			found["installation_id"],
			found["full_name"],
			title,
			body["body"],
		)
	except GitHubError as exc:
		if not exc.uncertain:
			# Definitely not created, and any earlier create was ruled out by
			# the lookups above: the next attempt needs no lookup.
			frappe.db.set_value(store.OPERATION, op_name, "request_started_at", None, update_modified=False)
			frappe.db.set_value(
				store.ISSUE_SYNC, link_name, "create_requested_at", None, update_modified=False
			)
			frappe.db.commit()
		raise
	record_created(link_name, task, issue, body)
	return store.outcome("Done")


def app_login() -> str | None:
	"""The login GitHub shows as the author of Issues this site's app opens."""
	slug = client.settings().app_slug
	return f"{slug}[bot]" if slug else None


def created_by_app(issue: IssueData, login: str | None) -> bool:
	"""Whether this site's app opened the Issue. A marker alone is not enough:
	anyone can copy an Issue body, marker included."""
	return bool(login) and issue["author_type"] == "Bot" and issue["author_login"] == login


def find_created(found: links.Target, marker: str, started_at: datetime) -> IssueData | None:
	"""The Issue this site's app created with ``marker`` since the request."""
	login = app_login()
	if not login:
		# Its Issues cannot be told apart from anyone else's: never guess.
		raise GitHubError("The GitHub App's name is not known. Refresh GitHub settings.", uncertain=True)
	# Keep the same whole-second cutoff previously sent through clock.iso.
	since = (clock.to_utc(started_at) - timedelta(minutes=5)).replace(microsecond=0)
	try:
		match = scan_for_marker(found, marker, since, login, filtered=True)
		if match:
			return match
	except GitHubError as exc:
		if exc.status != 422:
			raise
	# A bot creator filter can be rejected or return an empty list. Check
	# all recent Issues before ruling a create out; every match still has
	# to be authored by this site's app bot.
	return scan_for_marker(found, marker, since, login, filtered=False)


def scan_for_marker(
	found: links.Target, marker: str, since: datetime, login: str, *, filtered: bool
) -> IssueData | None:
	for page in range(1, LOOKUP_PAGES + 1):
		result = issues.list_issues(
			found["installation_id"],
			found["full_name"],
			state="all",
			sort="created",
			direction="desc",
			since=since,
			creator=login if filtered else None,
			page=page,
		)
		for issue in result["issues"]:
			if (
				not issue["is_pull_request"]
				and created_by_app(issue, login)
				and convert.find_marker(issue["body"]) == marker
			):
				return issue
		if not result["more"]:
			return None
	# Too many recent Issues to be sure: stay uncertain rather than guess.
	raise GitHubError(
		"Too many recent Issues to check for this one. Envision will check again.", uncertain=True
	)


def record_created(link_name: str, task: Document, issue: IssueData, body: IssueBody | None = None) -> None:
	"""Link the Task to its new Issue, with both sides' values as baselines.

	The identity is always recorded, so the Issue is never created again or
	imported as a new Task. A link paused, disconnected or tombstoned while
	the request was out keeps that state: only Resume continues it."""
	link = frappe.get_doc(store.ISSUE_SYNC, link_name, for_update=True)
	if link.issue_id:
		return
	other = links.link_for_issue(issue["id"])
	if other:
		link.sync_state = "Error"
		link.error = _("GitHub Issue #{0} is already linked to another task.").format(issue["number"])
		link.save(ignore_permissions=True)
		return
	identity = {
		"issue_id": issue["id"],
		"issue_node_id": issue["node_id"],
		"issue_number": issue["number"],
		"issue_url": issue["html_url"],
		"create_requested_at": None,
	}
	if link.sync_state == "Tombstoned":
		# The Task was deleted meanwhile: keep identity only, no content.
		link.update(identity)
		link.save(ignore_permissions=True)
		return
	active = link.sync_state in store.ACTIVE_STATES
	# Without the title's note, as reconcile compares it (setu.github.titles).
	description = titles.content(task.description, False)
	description_hash = convert.html_digest(description)
	if body is None:
		# Found after an uncertain create: what was sent is not known. If the
		# description has changed since, leave its baseline empty so the
		# next reconcile sends the newer description.
		body = body_for(link.create_marker, description, issue["body"])
		if body["changed"]:
			description_hash = None
	link.update(
		{
			**identity,
			"base_title_local": titles.title(task.subject, task.description, False),
			"base_title_remote": issue["title"],
			"base_description_hash": description_hash,
			"base_body_hash": convert.markdown_digest(issue["body"]),
			"remote_body_markdown": issue["body"],
			# A Task created Done closes its Issue on the next reconcile.
			"base_status": "Open" if task.status == "Completed" else task.status,
			"base_state": issue["state"],
			"base_state_reason": issue["state_reason"],
			"base_parent_issue_id": None,
			"remote_parent_issue_id": None,
			"remote_parent_issue_number": None,
			"remote_updated_at": issue["updated_at"],
			"last_synced_at": now_datetime(),
		}
	)
	if "body_too_long" in body["dropped"]:
		add_conflict(link, "description", "too_long", description, issue["body"], body["dropped"])
	elif body["lossy"]:
		# The Issue shows what Markdown can hold; the Task keeps everything.
		add_conflict(link, "description", "lossy_outbound", description, issue["body"], body["dropped"])
	if active:
		link.sync_state = "Conflict" if link.conflicts else "Synced"
		link.error = None
	link.save(ignore_permissions=True)
	if not active:
		return
	task.add_comment(
		"Info",
		_("Published to GitHub as {0}#{1}").format(link.repository_full_name or "", issue["number"]),
	)
	# Close a Done Task's Issue and attach it under its parent's Issue; then
	# attach Subtasks that published before this Task's Issue existed.
	store.queue_op(link_name, "reconcile", link.project)
	for child in frappe.get_all(
		store.ISSUE_SYNC,
		filters={
			"task": ["in", frappe.get_all("Task", filters={"parent_task": task.name}, pluck="name")],
			"sync_state": ["in", list(store.ACTIVE_STATES)],
			"issue_id": ["is", "set"],
		},
		fields=["name", "project"],
	):
		store.queue_op(child.name, "reconcile", child.project)


def add_conflict(
	link: Document,
	field: str,
	kind: str,
	local_value: str | None,
	remote_value: str | None,
	dropped: list[str] | None = None,
) -> None:
	"""Record or refresh the one open conflict for a field."""
	values = {
		"field": field,
		"kind": kind,
		"local_value": local_value or "",
		"remote_value": remote_value or "",
		"detail": ",".join(dropped or []),
	}
	for row in link.conflicts:
		if row.field == field:
			if row.kind != kind:
				values.update({"detected_on": now_datetime(), "resolution": None, "resolved_by": None})
			row.update(values)
			return
	link.append("conflicts", {**values, "detected_on": now_datetime()})


def site_url() -> str | None:
	try:
		return connection.public_url()
	except GitHubError:
		return None


def body_for(marker: str | None, html: str | None, remote_body: str | None) -> IssueBody:
	"""The Issue body for a description. Envision's Issues carry their create
	marker; an imported Issue's body gets none added."""
	url = site_url()
	if marker:
		return convert.issue_body(html, marker=marker, remote_body=remote_body, site_url=url)
	result = convert.html_to_markdown(html, site_url=url)
	existing = convert.find_marker(remote_body)
	body = convert.add_marker(result["markdown"], existing) if existing else result["markdown"]
	dropped = list(result["dropped"])
	if len(body) > convert.MAX_BODY_LENGTH:
		dropped.append("body_too_long")
	return {
		"body": body,
		"changed": remote_body is None
		or convert.normalize_markdown(body) != convert.normalize_markdown(remote_body),
		"lossy": result["lossy"] or "body_too_long" in dropped,
		"dropped": dropped,
	}
