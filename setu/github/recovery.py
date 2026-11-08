"""The 5-minute scan, for what no event will bring back (docs/adr/0008).

Tagged Tasks that no hook caught (a raw ``_user_tags`` edit, a failed hook) get their
link, and an Issue import that stopped is resumed. GitHub is never polled: Issue and
sub-issue changes arrive as webhooks, and failed work waits in Envision Retry Job.

Each Project is handled on its own: one failing repository never stops the rest.
"""

import frappe

from setu.github import activation, connection, links, projects, store

SCAN_FAILED = "GitHub sync recovery failed"
RESUMED_STATES = (activation.QUEUED, activation.FAILED)


def run_recovery() -> None:
	for route in projects.active_routes():
		try:
			scan_tags(route)
			resume_import(route)
			frappe.db.commit()
		except Exception as exc:
			frappe.db.rollback()
			store.log_safe(exc, SCAN_FAILED, "Project", route["project"])
			frappe.db.commit()


def scan_tags(route: dict) -> None:
	"""Open tagged Tasks with no link, however the tag got there. One that fails is
	logged, undone and tried again next time, without holding up the others."""
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
			links.guarded(links.tags_changed, row.name)


def resume_import(route: dict) -> None:
	state, modified = frappe.db.get_value(
		connection.PROJECT_ROUTE, route["name"], ["activation_import_state", "modified"]
	)
	if state in RESUMED_STATES or (
		state == activation.RUNNING and modified < activation.stale_import_cutoff()
	):
		activation.enqueue_import(route["project"])
