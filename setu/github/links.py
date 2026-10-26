"""Which Tasks link to GitHub Issues, and the Task and tag events that publish them.

Publishing (docs/adr/0008):

- The ``github`` tag publishes a Task, whether it is added at creation or
  later. Tags are added after a Task is inserted (setu.api.task) and through
  Frappe's tag API in Desk and REST, which inserts a Tag Link; so the triggers
  are ``on_tag_link_insert``, the explicit ``tags_changed`` call in the Task
  API, and setu.github.recovery's scan for tagged Tasks without a link.
- A published Task's whole Subtask tree publishes with it, and Subtasks added
  or moved under a published Task later publish too. A tagged Subtask whose
  parent is not published publishes as a standalone Issue.
- Nothing publishes until a manager has turned sync on for the Project.
  Tasks tagged before that are the backlog that activation previews.
- A Task links to at most one Issue, ever: a link that exists in any state,
  tombstones and disconnected links included, is never replaced, so removing
  and re-adding the tag never creates a second Issue.

Hooks run inside the user's own save. Each runs in a savepoint and logs
instead of failing the save; the recovery scan republishes anything missed.
This module does not import setu.api, which imports it.
"""

import secrets
from collections.abc import Callable
from typing import TypedDict

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime
from frappe.utils.nestedset import get_descendants_of

from setu.github import bot, clock, projects, store

GITHUB_TAG = "github"
# Task fields that sync. A change to any of them reconciles the link.
SYNC_FIELDS = ("subject", "description", "status", "parent_task")
TASK_FIELDS = ["name", "project", "status", "is_milestone", "is_template", "parent_task", "_user_tags"]
LINK_FIELDS = [
	"name",
	"task",
	"project",
	"repository_id",
	"repository_full_name",
	"sync_state",
	"paused_reason",
	"issue_id",
	"issue_number",
	"issue_url",
	"origin",
	"error",
	"hierarchy_error",
	"last_synced_at",
	"create_marker",
]
# Keep Envision / Keep GitHub, except where one side cannot be applied.
DEFAULT_CHOICES = ("envision", "github")
CHOICES: dict[str, tuple[str, ...]] = {
	# GitHub would refuse Envision's description: only GitHub's can win.
	"too_long": ("github",),
}


class RepositoryView(TypedDict):
	id: str
	full_name: str | None
	html_url: str | None
	private: bool | None


class RouteView(TypedDict):
	connected: bool
	sync_enabled: bool
	paused: bool
	blocker: str | None
	blocker_message: str | None
	repository: RepositoryView | None


class ConflictView(TypedDict):
	field: str
	kind: str
	detail: list[str]
	local_value: str
	remote_value: str
	allowed_choices: list[str]
	detected_on: str | None
	resolution: str | None


class LinkView(TypedDict):
	state: str
	paused_reason: str | None
	message: str | None
	issue_number: int | None
	issue_url: str | None
	repository_full_name: str | None
	origin: str | None
	last_synced_at: str | None
	pending_operations: int
	uncertain: bool
	error: str | None
	hierarchy_error: str | None
	conflicts: list[ConflictView]


class TaskActions(TypedDict):
	publish: bool
	retry: bool
	pause: bool
	resume: bool
	disconnect: bool
	resolve: bool


class TaskGitHub(TypedDict):
	task: str
	tagged: bool
	eligible: bool
	ineligible_reason: str | None
	# For a tagged Task without a link: why it has not published.
	waiting_reason: str | None
	waiting_message: str | None
	route: RouteView
	link: LinkView | None
	can_write: bool
	actions: TaskActions


def has_github_tag(user_tags: str | None) -> bool:
	return GITHUB_TAG in {tag.strip().casefold() for tag in (user_tags or "").split(",")}


def ineligible_reason(task: Document | frappe._dict) -> str | None:
	"""Only ordinary Tasks in a Project publish or import."""
	if task.get("is_milestone"):
		return "milestone"
	if task.get("is_template") or task.get("status") == "Template":
		return "template"
	if task.get("status") == "Cancelled":
		return "cancelled"
	if not task.get("project"):
		return "no_project"
	return None


def link_for_task(task: str) -> frappe._dict | None:
	return frappe.db.get_value(store.ISSUE_SYNC, {"task": task}, LINK_FIELDS, as_dict=True)


def link_for_issue(issue_id: str) -> frappe._dict | None:
	return frappe.db.get_value(store.ISSUE_SYNC, {"issue_id": issue_id}, LINK_FIELDS, as_dict=True)


def publishing(link: frappe._dict | None) -> bool:
	"""Whether a parent's link carries its new Subtasks along."""
	return bool(link and link.sync_state in store.ACTIVE_STATES)


# Publishing.


def tags_changed(task_name: str) -> None:
	"""Publish a Task that now has the ``github`` tag, with its Subtask tree.

	Idempotent: called from the Task API, the Tag Link hook and recovery.
	"""
	row = frappe.db.get_value("Task", task_name, TASK_FIELDS, as_dict=True)
	if not row or not has_github_tag(row._user_tags) or ineligible_reason(row):
		return
	if frappe.db.exists(store.ISSUE_SYNC, {"task": task_name}):
		return
	route = projects.route_for(project=row.project)
	# Before sync is on, a tagged Task is backlog: activation previews it.
	if not route or not route["sync_enabled"]:
		return
	prepare_subtree(task_name, route)


def publish_under_parent(task_name: str, parent: str, project: str) -> None:
	"""A Subtask added or moved under a published Task publishes too."""
	parent_link = link_for_task(parent)
	if not publishing(parent_link) or parent_link.project != project:
		return
	route = projects.route_for(project=project)
	if not route or not route["sync_enabled"] or route["repository"] != parent_link.repository_id:
		return
	prepare_subtree(task_name, route)


def subtree_rows(task_name: str) -> list[frappe._dict]:
	"""The Task and every descendant, parents before children."""
	descendants = get_descendants_of("Task", task_name, ignore_permissions=True)
	return frappe.get_all(
		"Task",
		filters={"name": ["in", [task_name, *descendants]]},
		fields=TASK_FIELDS,
		order_by="lft asc",
	)


def prepare_subtree(task_name: str, route: dict, *, held: bool = False) -> list[str]:
	"""Link every eligible, unlinked Task in the tree. Returns their names."""
	rows = subtree_rows(task_name)
	linked = set(
		frappe.get_all(store.ISSUE_SYNC, filters={"task": ["in", [row.name for row in rows]]}, pluck="task")
	)
	prepared = []
	for row in rows:
		if row.name in linked or ineligible_reason(row) or row.project != route["project"]:
			continue
		if prepare_publication(row.name, route, held=held):
			prepared.append(row.name)
	return prepared


def prepare_publication(task_name: str, route: dict, *, held: bool = False) -> str | None:
	"""Record that a Task publishes to the route's repository.

	The destination is fixed here: a later route change never reroutes it.
	``held`` keeps it unpublished (a backlog the manager chose not to publish)
	until someone publishes it explicitly. Returns None if a link exists.
	"""
	repository_row = route["repository_row"] or {}
	name = store.insert_unique(
		{
			"doctype": store.ISSUE_SYNC,
			"task": task_name,
			"project": route["project"],
			"repository_id": route["repository"],
			"repository_full_name": repository_row.get("full_name"),
			"origin": "Envision",
			"sync_state": "Paused" if held else "Pending",
			"paused_reason": "backlog_held" if held else None,
			# The same form as setu.github.convert.new_marker. Generated here so
			# the Task API never loads the Markdown converter.
			"create_marker": secrets.token_urlsafe(18),
		}
	)
	if name and not held:
		store.queue_op(name, "create_issue", route["project"])
	return name


# Document hooks (setu/hooks.py).


def guarded(function: Callable[..., None], *args: str | Document) -> None:
	"""Run sync bookkeeping without ever failing the user's save."""
	frappe.db.savepoint("envision_github_hook")
	try:
		function(*args)
	except Exception as exc:
		frappe.db.rollback(save_point="envision_github_hook")
		store.log_safe(exc, "GitHub sync hook failed", "Task", None)


def on_task_insert(doc: Document, method: str | None = None) -> None:
	if bot.inbound() or not doc.parent_task or ineligible_reason(doc):
		return
	guarded(publish_under_parent, doc.name, doc.parent_task, doc.project)


def on_task_update(doc: Document, method: str | None = None) -> None:
	# Inserts are handled by on_task_insert; GitHub's own changes are already
	# reconciled by the code saving them.
	if bot.inbound() or doc.flags.in_insert or doc.get_doc_before_save() is None:
		return
	guarded(task_updated, doc)


def task_updated(doc: Document) -> None:
	link = link_for_task(doc.name)
	if link:
		if link.sync_state not in store.ACTIVE_STATES:
			return
		# Never reroute: a Task that leaves its Project or stops being an
		# ordinary Task pauses until someone reviews it.
		if doc.project != link.project:
			store.pause_links({"name": link.name}, "project_changed")
		elif ineligible_reason(doc):
			store.pause_links({"name": link.name}, "task_ineligible")
		elif any(doc.has_value_changed(field) for field in SYNC_FIELDS):
			store.queue_op(link.name, "reconcile", link.project)
		return
	if doc.parent_task and doc.has_value_changed("parent_task") and not ineligible_reason(doc):
		publish_under_parent(doc.name, doc.parent_task, doc.project)


def on_task_trash(doc: Document, method: str | None = None) -> None:
	"""Deleting a Task never deletes its Issue. Its link becomes a tombstone,
	so neither recovery nor GitHub can bring the Task back.

	Runs before Frappe's link check, and clears the link's Task, so the link
	never blocks the delete."""
	link = link_for_task(doc.name)
	if link:
		tombstone(link.name, doc.name)


def on_tag_link_insert(doc: Document, method: str | None = None) -> None:
	if doc.document_type != "Task" or (doc.tag or "").strip().casefold() != GITHUB_TAG or bot.inbound():
		return
	guarded(tags_changed, doc.document_name)


# Lifecycle.


def tombstone(link_name: str, task_name: str) -> None:
	# Identity and the create marker stay, so a late or uncertain create is
	# still recognised as Envision's and never imported as a new Task.
	store.cancel_ops([link_name])
	frappe.db.delete(store.SYNC_CONFLICT, {"parenttype": store.ISSUE_SYNC, "parent": link_name})
	frappe.db.set_value(
		store.ISSUE_SYNC,
		link_name,
		{
			"task": None,
			"deleted_task_name": task_name,
			"sync_state": "Tombstoned",
			"paused_reason": None,
			"error": None,
			"hierarchy_error": None,
			"base_title_local": None,
			"base_title_remote": None,
			"remote_body_markdown": None,
		},
	)


def pause(link_name: str) -> None:
	link = frappe.db.get_value(store.ISSUE_SYNC, link_name, ["sync_state"], as_dict=True, for_update=True)
	if not link or link.sync_state not in store.ACTIVE_STATES:
		frappe.throw(_("Only a syncing task can be paused."))
	store.pause_links({"name": link_name}, "user_paused")


def resume(link_name: str) -> None:
	"""Resume a paused or disconnected link: compare both sides before any
	write. Never moves it to another repository."""
	link = frappe.db.get_value(
		store.ISSUE_SYNC,
		link_name,
		["name", "task", "project", "repository_id", "sync_state", "paused_reason", "issue_id"],
		as_dict=True,
		for_update=True,
	)
	if not link or link.sync_state not in ("Paused", "Disconnected"):
		frappe.throw(_("This task is not paused."))
	route = projects.route_for(project=link.project)
	if not route or not route["sync_enabled"]:
		frappe.throw(_("Turn on GitHub sync for this project first."))
	if route["repository"] != link.repository_id:
		frappe.db.set_value(
			store.ISSUE_SYNC,
			link_name,
			{"sync_state": "Paused", "paused_reason": "destination_changed"},
		)
		frappe.throw(
			_(
				"This task's GitHub Issue is in a different repository from the project's. "
				"Envision never moves an Issue; disconnect this task instead."
			)
		)
	task = frappe.db.get_value("Task", link.task, TASK_FIELDS, as_dict=True) if link.task else None
	if not task:
		frappe.throw(_("This task no longer exists."))
	if task.project != link.project:
		frappe.throw(_("Move the task back to its project before resuming GitHub sync."))
	if ineligible_reason(task):
		frappe.throw(_("Only ordinary tasks sync with GitHub."))
	frappe.db.set_value(
		store.ISSUE_SYNC,
		link_name,
		{
			"sync_state": "Synced" if link.issue_id else "Pending",
			"paused_reason": None,
			"error": None,
		},
	)
	store.requeue_waiting([link_name])
	store.queue_op(link_name, "reconcile" if link.issue_id else "create_issue", link.project)


def publish_held(link_name: str) -> int:
	"""Publish a held backlog Task and its held Subtasks. Returns the count.

	The Task itself must publish (a refusal is shown); a Subtask that cannot
	(moved or no longer eligible) stays held for review and is skipped."""
	link = frappe.db.get_value(store.ISSUE_SYNC, link_name, ["task", "project"], as_dict=True)
	rows = subtree_rows(link.task)
	held = dict(
		frappe.get_all(
			store.ISSUE_SYNC,
			filters={
				"task": ["in", [row.name for row in rows[1:]] or [""]],
				"sync_state": "Paused",
				"paused_reason": "backlog_held",
			},
			fields=["task", "name"],
			as_list=True,
		)
	)
	resume(link_name)
	published = 1
	# Parents before children, so a Subtask's Issue attaches under its parent's.
	for row in rows[1:]:
		if row.name in held and store.attempt(resume, held[row.name]):
			published += 1
	return published


def disconnect(link_name: str) -> None:
	"""Stop syncing this Task for good. The Issue is untouched, the identity
	is kept, and the tag never publishes the Task again; Resume relinks it."""
	link = frappe.db.get_value(store.ISSUE_SYNC, link_name, ["sync_state"], as_dict=True, for_update=True)
	if not link or link.sync_state in ("Disconnected", "Tombstoned"):
		frappe.throw(_("This task is not syncing."))
	store.cancel_ops([link_name])
	frappe.db.set_value(
		store.ISSUE_SYNC,
		link_name,
		{"sync_state": "Disconnected", "paused_reason": None, "error": None},
	)


class Target(TypedDict):
	"""Where a link's GitHub work goes: its route's repository, right now."""

	route: dict
	installation_id: str
	full_name: str


def target(link: Document | frappe._dict) -> tuple[Target | None, str | None]:
	"""The link's repository and installation, or why work cannot run now.

	``destination_changed`` when the Project now routes elsewhere: the link
	keeps its own repository and is never rerouted.
	"""
	route = projects.route_for(project=link.project)
	blocker = projects.sync_blocker(route)
	if blocker:
		return None, blocker
	if route["repository"] != link.repository_id:
		return None, "destination_changed"
	row = route["repository_row"]
	return {"route": route, "installation_id": row.installation, "full_name": row.full_name}, None


def blocked(link_name: str, blocker: str) -> store.Outcome:
	"""The outcome for work whose route cannot carry it now."""
	if blocker == "destination_changed":
		store.pause_links({"name": link_name}, "destination_changed")
		return store.outcome("Cancelled", error=state_message("Paused", "destination_changed"))
	if blocker in ("sync_paused", "sync_not_enabled", "not_connected"):
		# Resuming or turning sync on releases it (store.requeue_waiting).
		return store.outcome("Waiting")
	# Access or site problems can clear without an Envision action (a
	# GitHub settings refresh), so look again later.
	return store.outcome(
		"Waiting",
		retry_at=add_to_date(now_datetime(), minutes=15),
		error=projects.inactive_message(blocker),
	)


def allowed_choices(kind: str) -> list[str]:
	return list(CHOICES.get(kind, DEFAULT_CHOICES))


# Projection for the Task page (setu.api.github.get_task_github).


def state_message(state: str, reason: str | None) -> str | None:
	if state == "Pending":
		return _("Waiting to publish to GitHub.")
	if state == "Disconnected":
		return _("Sync with GitHub is off for this task. The Issue was left as it is.")
	if state == "Tombstoned":
		return None
	if state != "Paused":
		return None
	return {
		"user_paused": _("Sync with GitHub is paused for this task."),
		"backlog_held": _("Tagged before sync was turned on, and not published yet."),
		"route_cleared": _("The project's repository was disconnected."),
		"app_disconnected": _("The site's GitHub App was disconnected."),
		"project_changed": _("The task moved to another project. Envision never moves an Issue."),
		"task_ineligible": _("Only ordinary tasks sync. Milestones, templates and cancelled tasks don't."),
		"transferred": _("The Issue was transferred to another repository on GitHub."),
		"remote_deleted": _("GitHub can't find this Issue. It may have been deleted."),
		"access_lost": _("The GitHub App lost access to this Issue's repository."),
		"destination_changed": _("The project now uses a different repository than this task's Issue."),
	}.get(reason or "", _("Sync with GitHub is paused for this task."))


def route_view(project: str) -> tuple[RouteView, dict | None]:
	route = projects.route_for(project=project)
	blocker = projects.sync_blocker(route)
	repository = None
	if route:
		row = route["repository_row"]
		repository = {
			"id": route["repository"],
			"full_name": row.full_name if row else None,
			"html_url": row.html_url if row else None,
			"private": bool(row.private) if row else None,
		}
	return (
		{
			"connected": bool(route),
			"sync_enabled": bool(route and route["sync_enabled"]),
			"paused": bool(route and route["paused"]),
			"blocker": blocker,
			"blocker_message": projects.inactive_message(blocker) if blocker else None,
			"repository": repository,
		},
		route,
	)


def link_view(link_name: str, route_blocked: bool) -> LinkView:
	doc = frappe.get_doc(store.ISSUE_SYNC, link_name)
	# Work that runs without anyone acting: none while the link or its route
	# is stopped, and never operations waiting for a Resume (the Task page
	# follows pending work until it ends).
	running = doc.sync_state in store.ACTIVE_STATES and not route_blocked
	pending = (
		frappe.db.count(
			store.OPERATION,
			{"link": link_name, "status": ["in", ["Queued", "Running", "Retrying", "Uncertain"]]},
		)
		if running
		else 0
	)
	return {
		"state": doc.sync_state,
		"paused_reason": doc.paused_reason or None,
		"message": state_message(doc.sync_state, doc.paused_reason),
		"issue_number": doc.issue_number or None,
		"issue_url": doc.issue_url or None,
		"repository_full_name": doc.repository_full_name or None,
		"origin": doc.origin or None,
		"last_synced_at": clock.site_iso(doc.last_synced_at),
		"pending_operations": pending,
		# A create was sent and its outcome is still being checked.
		"uncertain": bool(running and not doc.issue_id and doc.create_requested_at),
		"error": doc.error or None,
		"hierarchy_error": doc.hierarchy_error or None,
		"conflicts": [
			{
				"field": row.field,
				"kind": row.kind,
				"detail": [code for code in (row.detail or "").split(",") if code],
				"local_value": row.local_value or "",
				"remote_value": row.remote_value or "",
				"allowed_choices": allowed_choices(row.kind),
				"detected_on": clock.site_iso(row.detected_on),
				"resolution": row.resolution or None,
			}
			for row in doc.conflicts
		],
	}


def task_projection(task: Document) -> TaskGitHub:
	"""What a Task reader sees of its GitHub link. The caller checked read."""
	tags = frappe.db.get_value("Task", task.name, "_user_tags")
	tagged = has_github_tag(tags)
	reason = ineligible_reason(task)
	# A Task without a Project has no route: route_for returns None for it.
	route, raw_route = route_view(task.project or "")
	link = link_for_task(task.name)
	view = link_view(link.name, route["blocker"] is not None) if link else None
	can_write = bool(task.has_permission("write"))
	waiting = None
	if tagged and not link and not reason:
		waiting = route["blocker"] or ("publishing" if raw_route and raw_route["sync_enabled"] else None)
	state = view["state"] if view else None
	return {
		"task": task.name,
		"tagged": tagged,
		"eligible": reason is None,
		"ineligible_reason": reason,
		"waiting_reason": waiting,
		"waiting_message": (
			_("Publishing to GitHub shortly.")
			if waiting == "publishing"
			else (projects.inactive_message(waiting) if waiting else None)
		),
		"route": route,
		"link": view,
		"can_write": can_write,
		"actions": {
			"publish": can_write
			and (
				(view is not None and state == "Paused" and view["paused_reason"] == "backlog_held")
				or (view is None and tagged and reason is None and route["sync_enabled"])
			),
			"retry": can_write and view is not None and state in ("Error", "Pending", "Conflict"),
			"pause": can_write and state in store.ACTIVE_STATES,
			"resume": can_write
			and (
				(state == "Paused" and view["paused_reason"] not in ("backlog_held", "destination_changed"))
				or state == "Disconnected"
			),
			"disconnect": can_write and view is not None and state not in ("Disconnected", "Tombstoned"),
			"resolve": can_write and bool(view and view["conflicts"]),
		},
	}
