"""Scheduled recovery for recorded work.

``run_recovery`` (every 5 minutes) restarts operations whose queue message
was lost or whose worker died, publishes tagged Tasks and new Subtasks of
published Tasks that no hook caught (a raw ``_user_tags`` edit, a failed
hook), reconciles Tasks changed without a recorded operation, and resumes an
interrupted labelled-Issue import. GitHub is never polled: Issue and
sub-issue changes arrive as webhooks (docs/adr/0008).

Each Project is handled on its own: one failing repository never stops the rest.
"""

import frappe
from frappe.utils import add_to_date, now_datetime

from setu.github import activation, connection, links, projects, store

STALE_RUNNING_MINUTES = 15
BATCH = 200


def run_recovery() -> None:
	restart_stale_operations()
	enqueue_due_operations()
	for route in projects.active_routes():
		try:
			scan_tags(route)
			scan_new_subtasks(route)
			resume_import(route)
			frappe.db.commit()
		except Exception as exc:
			frappe.db.rollback()
			store.log_safe(exc, "GitHub sync recovery failed", "Project", route["project"])
	try:
		scan_local_changes()
		frappe.db.commit()
	except Exception as exc:
		frappe.db.rollback()
		store.log_safe(exc, "GitHub sync recovery failed", store.ISSUE_SYNC, None)


def restart_stale_operations() -> None:
	"""A worker that died mid-operation. A create keeps ``request_started_at``,
	so restarting it looks for its Issue before sending anything."""
	cutoff = add_to_date(now_datetime(), minutes=-STALE_RUNNING_MINUTES)
	for name in frappe.get_all(
		store.OPERATION,
		filters={"status": "Running", "modified": ["<", cutoff]},
		pluck="name",
		limit_page_length=BATCH,
	):
		frappe.db.set_value(store.OPERATION, name, {"status": "Queued", "retry_at": None})
	frappe.db.commit()


def enqueue_due_operations() -> None:
	now = now_datetime()
	due = set(
		frappe.get_all(
			store.OPERATION,
			filters={"status": "Queued"},
			pluck="link",
			distinct=True,
			limit_page_length=BATCH,
		)
	)
	due.update(
		frappe.get_all(
			store.OPERATION,
			filters={"status": ["in", ["Waiting", "Retrying", "Uncertain"]], "retry_at": ["<=", now]},
			pluck="link",
			distinct=True,
			limit_page_length=BATCH,
		)
	)
	for link in due:
		store.enqueue_committed(link)


def scan_tags(route: dict) -> None:
	"""Tagged Tasks with no link, however the tag got there."""
	for row in frappe.get_all(
		"Task",
		filters={
			"project": route["project"],
			"_user_tags": ["like", f"%{links.GITHUB_TAG}%"],
			"is_milestone": 0,
			"is_template": 0,
			"status": ["not in", ["Cancelled", "Template"]],
		},
		fields=["name", "_user_tags"],
		limit_page_length=500,
	):
		if links.has_github_tag(row._user_tags) and not frappe.db.exists(
			store.ISSUE_SYNC, {"task": row.name}
		):
			links.tags_changed(row.name)


def scan_new_subtasks(route: dict) -> None:
	"""Subtasks of published Tasks with no link of their own."""
	task = frappe.qb.DocType("Task")
	parent_link = frappe.qb.DocType(store.ISSUE_SYNC).as_("parent_link")
	child_link = frappe.qb.DocType(store.ISSUE_SYNC).as_("child_link")
	rows = (
		frappe.qb.from_(task)
		.join(parent_link)
		.on(parent_link.task == task.parent_task)
		.left_join(child_link)
		.on(child_link.task == task.name)
		.select(task.name, task.parent_task)
		.where(task.project == route["project"])
		.where(child_link.name.isnull())
		.where(parent_link.sync_state.isin(list(store.ACTIVE_STATES)))
		.where(task.is_milestone == 0)
		.where(task.is_template == 0)
		.where(task.status.notin(["Cancelled", "Template"]))
		.limit(BATCH)
	).run(as_dict=True)
	for row in rows:
		links.publish_under_parent(row.name, row.parent_task, route["project"])


def scan_local_changes() -> None:
	"""Linked Tasks changed after their last sync with no operation recorded
	(a failed hook, or a direct database change)."""
	link = frappe.qb.DocType(store.ISSUE_SYNC)
	task = frappe.qb.DocType("Task")
	rows = (
		frappe.qb.from_(link)
		.join(task)
		.on(task.name == link.task)
		.select(link.name, link.project)
		.where(link.sync_state.isin(["Synced", "Conflict", "Error"]))
		.where(link.issue_id.isnotnull())
		.where(link.last_synced_at.isnull() | (task.modified > link.last_synced_at))
		.limit(BATCH)
	).run(as_dict=True)
	for row in rows:
		if not store.has_open_ops(row.name):
			store.queue_op(row.name, "reconcile", row.project)


def resume_import(route: dict) -> None:
	state, modified = frappe.db.get_value(
		connection.PROJECT_ROUTE, route["name"], ["activation_import_state", "modified"]
	)
	if state in ("Queued", "Failed") or (state == "Running" and modified < activation.stale_import_cutoff()):
		activation.enqueue_import(route["project"])
