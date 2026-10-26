"""GitHub → Envision: Issue webhooks, new Issue imports and sub-issue changes.

Receipts (setu.github.events) store identifiers only. Issue events are
processed by reading GitHub's current state rather than replaying payloads;
a sub-issue change is taken from its payload (parent, child and action).
Processing never holds the global connection lock: a per-Issue lock
serializes it instead.

Which Issues become Tasks (docs/adr/0008):

- an Issue created after sync was turned on, labelled or not;
- an Issue that already had the ``github`` label when sync was turned on
  (setu.github.activation imports those);
- never a pull request, an Issue created before activation without the
  label, an Issue Envision itself created (its body carries the create
  marker), or one already linked or tombstoned.

An import is recorded first: a link with the unique Issue id, then an
``import_issue`` operation that creates the Task as the integration user.
So concurrent deliveries and retries import an Issue once, and a refused Task
is a visible, retryable error instead of a lost event.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime
from redis.exceptions import LockError

from setu.github import (
	bot,
	client,
	clock,
	connection,
	convert,
	issues,
	links,
	outbound,
	projects,
	reconcile,
	store,
	titles,
)
from setu.github.client import GitHubError
from setu.github.issues import IssueData

ISSUE_EVENTS = ("issues", "sub_issues")
# Issue actions that cannot change a synced field of a linked Issue.
QUIET_ACTIONS = (
	"assigned",
	"unassigned",
	"labeled",
	"unlabeled",
	"milestoned",
	"demilestoned",
	"locked",
	"unlocked",
	"pinned",
	"unpinned",
	"typed",
	"untyped",
)
GONE = (301, 404, 410)


def process_issue_delivery(delivery_id: str) -> None:
	doc = frappe.get_doc(connection.DELIVERY, delivery_id)
	if doc.status not in ("Queued", "Failed", "Processing"):
		return
	settings = client.settings()
	if not settings.app_id or doc.app_id != settings.app_id:
		close(doc, "Ignored", _("This delivery belongs to a disconnected app."))
		return
	route = route_for_delivery(doc)
	if not route:
		close(doc, "Ignored", _("This repository is not connected to a project."))
		return
	blocker = projects.sync_blocker(route)
	if blocker:
		# Kept for when sync resumes (setu.github.activation.resume).
		close(doc, "Deferred", projects.inactive_message(blocker))
		return
	doc.status = "Processing"
	doc.attempts += 1
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	try:
		with store.issue_lock(doc.issue_id):
			note = handle_issue(doc, route) if doc.event == "issues" else handle_sub_issue(doc, route)
		doc.status = "Processed"
		doc.error = note
	except LockError:
		frappe.db.rollback()
		doc.status = "Queued"
		doc.attempts -= 1
		doc.error = _("Another worker is processing this Issue; it will be retried.")
	except GitHubError as exc:
		frappe.db.rollback()
		if exc.rate_limited:
			doc.status = "Queued"
			doc.attempts -= 1
		else:
			doc.status = "Failed"
		doc.error = str(exc)
	except Exception as exc:
		frappe.db.rollback()
		store.log_safe(exc, "GitHub Issue delivery failed", connection.DELIVERY, delivery_id)
		doc.status = "Failed"
		doc.error = _("Issue processing failed. It will be retried.")
	doc.processed_at = now_datetime()
	doc.save(ignore_permissions=True)
	frappe.db.commit()


def close(doc, status: str, error: str | None) -> None:
	doc.status = status
	doc.error = error
	doc.processed_at = now_datetime()
	doc.save(ignore_permissions=True)
	frappe.db.commit()


def route_for_delivery(doc) -> dict | None:
	"""The route for the delivery's repository, if its installation owns it."""
	if not doc.repository_id:
		return None
	route = projects.route_for(repository=doc.repository_id)
	if not route:
		return None
	row = route["repository_row"]
	if not row or str(row.installation) != str(doc.installation_id):
		return None
	return route


def handle_issue(doc, route: dict) -> str | None:
	link = links.link_for_issue(doc.issue_id)
	if link:
		if link.sync_state in ("Disconnected", "Tombstoned"):
			return _("This Issue's task no longer syncs.")
		if doc.action == "deleted":
			store.pause_links({"name": link.name}, "remote_deleted")
			return None
		if doc.action == "transferred":
			store.pause_links({"name": link.name}, "transferred")
			return None
		if not link.task:
			store.queue_op(link.name, "import_issue", link.project)
			return None
		if doc.action in QUIET_ACTIONS:
			return None
		if doc.actor_login:
			frappe.db.set_value(
				store.ISSUE_SYNC, link.name, "last_actor_login", doc.actor_login, update_modified=False
			)
		store.queue_op(link.name, "reconcile", link.project)
		return None
	if doc.action in ("deleted", "transferred"):
		return None
	row = route["repository_row"]
	try:
		issue = issues.get_issue(row.installation, row.full_name, doc.issue_number)
	except GitHubError as exc:
		if exc.status in GONE:
			return _("The Issue is no longer in this repository.")
		raise
	return consider_import(route, issue, actor=doc.actor_login)


def consider_import(
	route: dict, issue: IssueData, *, labelled: bool = False, actor: str | None = None
) -> str | None:
	"""Record an Issue for import if it should become a Task. Returns why
	not, or None. ``labelled``: it carried the github label at activation."""
	if issue["is_pull_request"]:
		return _("Pull requests are not synced.")
	if links.link_for_issue(issue["id"]):
		return None
	marker = convert.find_marker(issue["body"])
	if marker and issue["author_type"] == "Bot":
		own = frappe.db.get_value(
			store.ISSUE_SYNC,
			{"create_marker": marker},
			["name", "project", "sync_state", "issue_id"],
			as_dict=True,
		)
		if not own or not outbound.created_by_app(issue, outbound.app_login()):
			return _("Created by Envision on another site; not imported.")
		if not own.issue_id and own.sync_state in store.ACTIVE_STATES:
			# Envision's own create, not yet recorded: let it find this Issue.
			store.queue_op(own.name, "create_issue", own.project)
		# Either way never a new Task: a second Issue with a linked Task's
		# marker is a duplicate create, left on GitHub for a person to close.
		return _("Created by Envision.")
	if not labelled:
		created = clock.parse(issue["created_at"])
		activated = clock.parse(route["activated_at_utc"])
		if not created or not activated or created < activated:
			return _("Created before sync was turned on, without the github label; not imported.")
	row = route["repository_row"]
	name = store.insert_unique(
		{
			"doctype": store.ISSUE_SYNC,
			"project": route["project"],
			"repository_id": route["repository"],
			"repository_full_name": row.full_name if row else None,
			"origin": "GitHub",
			"sync_state": "Pending",
			"issue_id": issue["id"],
			"issue_node_id": issue["node_id"],
			"issue_number": issue["number"],
			"issue_url": issue["html_url"],
			"last_actor_login": actor or issue["author_login"] or None,
		}
	)
	if name:
		store.queue_op(name, "import_issue", route["project"])
	return None


def import_issue(link_name: str, op_name: str) -> store.Outcome:
	"""Create the Task for a recorded Issue (worker operation)."""
	link = frappe.get_doc(store.ISSUE_SYNC, link_name)
	if link.task:
		return store.outcome("Done")
	if link.sync_state in ("Disconnected", "Tombstoned"):
		return store.outcome("Cancelled")
	if link.sync_state == "Paused":
		return store.outcome("Waiting")
	found, blocker = links.target(link)
	if blocker or not found:
		return links.blocked(link_name, blocker or "not_connected")
	try:
		issue = issues.get_issue(found["installation_id"], found["full_name"], link.issue_number)
	except GitHubError as exc:
		if exc.status not in GONE:
			raise
		drop_import(link_name)
		return store.outcome("Cancelled")
	if issue["is_pull_request"] or issue["id"] != link.issue_id:
		drop_import(link_name)
		return store.outcome("Cancelled")

	title = issue["title"].strip() or _("Untitled GitHub issue")
	subject, rest = titles.split(title, reconcile.subject_limit())
	# The new description starts with the note Envision wrote, if any.
	continued = bool(rest)
	rendered = convert.markdown_to_html(issue["body"])
	frappe.db.savepoint("envision_github_import")
	try:
		with bot.as_bot():
			task = frappe.new_doc("Task")
			task.project = link.project
			# A title longer than a subject continues in the description, and
			# stays whole on GitHub (setu.github.titles).
			task.subject = subject
			task.description = titles.compose(None, rendered["html"], titles.note(rest), continued)
			task.status = "Open"
			task.priority = "Medium"
			# As create_task does, so imported Tasks can hold Subtasks.
			task.is_group = 1
			task.insert(ignore_permissions=True)
	except frappe.ValidationError as exc:
		frappe.db.rollback(save_point="envision_github_import")
		return store.outcome("Error", error=store.error_text(exc))

	saved = frappe.db.get_value("Task", task.name, ["subject", "description"], as_dict=True)
	doc = frappe.get_doc(store.ISSUE_SYNC, link_name, for_update=True)
	doc.update(
		{
			"task": task.name,
			"issue_node_id": issue["node_id"],
			"issue_url": issue["html_url"],
			"base_title_local": titles.title(saved.subject, saved.description, continued),
			"base_title_remote": issue["title"],
			"base_description_hash": convert.html_digest(titles.content(saved.description, continued)),
			"base_body_hash": convert.markdown_digest(issue["body"]),
			"remote_body_markdown": issue["body"],
			# Imported open; a closed Issue's status is reconciled next, so
			# completion runs through the normal rules (P4/P10).
			"base_status": "Open",
			"base_state": "open",
			"base_state_reason": None,
			"remote_updated_at": issue["updated_at"],
			"last_synced_at": now_datetime(),
			"sync_state": "Synced",
			"error": None,
		}
	)
	if rendered["lossy"]:
		outbound.add_conflict(
			doc,
			"description",
			"lossy_inbound",
			titles.content(task.description, continued),
			issue["body"],
			list(rendered["dropped"]),
		)
	if doc.conflicts:
		doc.sync_state = "Conflict"
	doc.save(ignore_permissions=True)
	with bot.as_bot():
		author = doc.last_actor_login or issue["author_login"]
		text = _("Imported from GitHub issue {0}#{1}").format(doc.repository_full_name or "", issue["number"])
		if author:
			text += " " + _("(opened by @{0})").format(author)
		task.add_comment("Info", text)

	# Each side of a parent link records it, so import order does not matter:
	# this child names its own parent if that parent is already linked, and
	# observe_sub_issues below names this Issue's linked children.
	parent = linked_parent(link.repository_id, found["full_name"], issue)
	if parent:
		set_remote_parent(link_name, link.project, parent.issue_id, parent.issue_number)
	# A closed Issue's status, and a parent GitHub named while the Task did
	# not exist yet (handle_sub_issue), are reconciled through the normal rules.
	if issue["state"] == "closed" or doc.remote_parent_issue_id:
		store.queue_op(link_name, "reconcile", link.project)
	for child in frappe.get_all(
		store.ISSUE_SYNC,
		filters={
			"remote_parent_issue_id": issue["id"],
			"sync_state": ["in", list(store.ACTIVE_STATES)],
			"task": ["is", "set"],
		},
		fields=["name", "project"],
	):
		store.queue_op(child.name, "reconcile", child.project)
	if issue["sub_issue_count"]:
		observe_sub_issues(found, issue["id"], issue["number"])
	return store.outcome("Done")


def drop_import(link_name: str) -> None:
	"""An Issue that cannot be imported after all (gone, moved, or a pull
	request): its unfinished link holds no Task and is removed, so the Issue
	can still import later if it becomes readable again. The running
	operation stays for the worker to close."""
	frappe.db.delete(store.OPERATION, {"link": link_name, "status": ["!=", "Running"]})
	frappe.db.delete(store.SYNC_CONFLICT, {"parenttype": store.ISSUE_SYNC, "parent": link_name})
	frappe.db.delete(store.ISSUE_SYNC, {"name": link_name, "task": ["is", "not set"]})


def handle_sub_issue(doc, route: dict) -> str | None:
	"""A sub-issue was added to or removed from a parent: record what the
	payload says on the child's link, without reading GitHub again.

	One link usually arrives twice (``sub_issue_*`` for the parent's side,
	``parent_issue_*`` for the child's), and recording the same parent twice
	changes nothing. A removal clears only the parent it names, so a late
	removal never undoes a newer parent.

	GitHub's "Create sub-issue" sends the child's ``opened`` event and this one
	together, so the child may not be recorded or imported yet: it is
	considered for import first, and a child whose Task does not exist yet
	keeps the parent for its import to reconcile."""
	removed = (doc.action or "").endswith("_removed")
	same_repository = not doc.related_repository_id or str(doc.related_repository_id) == str(
		route["repository"]
	)
	if not doc.related_issue_id or (same_repository and not doc.related_issue_number):
		return _("The parent Issue was not named.")
	child = links.link_for_issue(doc.issue_id)
	if not child and not removed:
		note = record_child(doc, route)
		if note:
			return note
		child = links.link_for_issue(doc.issue_id)
	if not child or child.sync_state not in store.ACTIVE_STATES:
		return _("The sub-issue is not synced.")
	if removed:
		current = frappe.db.get_value(store.ISSUE_SYNC, child.name, "remote_parent_issue_id")
		if current == doc.related_issue_id:
			set_remote_parent(child.name, child.project, None, None)
		return None
	# A parent in another repository cannot be a Task's parent here: it is
	# recorded without a number, and the reconcile shows a sub-issue error.
	number = doc.related_issue_number if same_repository else None
	set_remote_parent(child.name, child.project, doc.related_issue_id, number)
	return None


def record_child(doc, route: dict) -> str | None:
	"""A sub-issue with no link yet: record it for import as its ``opened``
	event would, under the same rules. Returns why not, or None."""
	if not doc.issue_number:
		return _("The sub-issue is not synced.")
	row = route["repository_row"]
	try:
		issue = issues.get_issue(row.installation, row.full_name, doc.issue_number)
	except GitHubError as exc:
		if exc.status in GONE:
			return _("The Issue is no longer in this repository.")
		raise
	if issue["id"] != doc.issue_id:
		return _("The sub-issue is not synced.")
	return consider_import(route, issue, actor=doc.actor_login)


def linked_parent(repository_id: str, full_name: str, issue: IssueData) -> frappe._dict | None:
	"""The active link of an Issue's GitHub parent in the same repository, or
	None when it has no parent or the parent is not synced."""
	if not issue["parent_number"] or (issue["parent_full_name"] or "").lower() != full_name.lower():
		return None
	return frappe.db.get_value(
		store.ISSUE_SYNC,
		{
			"repository_id": repository_id,
			"issue_number": issue["parent_number"],
			"issue_id": ["is", "set"],
			"sync_state": ["in", list(store.ACTIVE_STATES)],
		},
		["issue_id", "issue_number"],
		as_dict=True,
	)


def observe_sub_issues(found: links.Target, parent_id: str, parent_number: int) -> list[str]:
	"""Record a parent Issue's current sub-issues on their links, including
	children still being imported. Returns the child Issue ids GitHub listed."""
	ids = issues.list_sub_issue_ids(found["installation_id"], found["full_name"], parent_number)
	for child in frappe.get_all(
		store.ISSUE_SYNC,
		filters={"issue_id": ["in", ids or [""]], "sync_state": ["in", list(store.ACTIVE_STATES)]},
		fields=["name", "project"],
	):
		set_remote_parent(child.name, child.project, parent_id, parent_number)
	return ids


def set_remote_parent(link_name: str, project: str, parent_id: str | None, parent_number: int | None) -> None:
	"""Record where GitHub has this Issue now; reconcile decides what follows.

	A link whose Task is still being imported keeps the parent too, and its
	import reconciles it. The row is read locked, so a concurrent import
	either sees this parent or is seen here as having created the Task. The
	parent's row is written first, the order import_issue locks them in."""
	current = frappe.db.get_value(
		store.ISSUE_SYNC,
		link_name,
		["task", "remote_parent_issue_id", "remote_parent_issue_number"],
		as_dict=True,
		for_update=True,
	)
	if (current.remote_parent_issue_id or None) == parent_id and (
		current.remote_parent_issue_number or None
	) == parent_number:
		return
	frappe.db.set_value(
		store.ISSUE_SYNC,
		link_name,
		{"remote_parent_issue_id": parent_id, "remote_parent_issue_number": parent_number},
	)
	if current.task:
		store.queue_op(link_name, "reconcile", project)
