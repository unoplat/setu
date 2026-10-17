"""Make existing Envision Tasks groups, so they can hold Subtasks.

ERPNext refuses a Subtask under a Task that is not a group. setu.api.task.create_task
makes every new Envision Task a group; this gives Tasks created before that the
same default. Milestones, templates and Tasks outside Envision keep ERPNext's own.
"""

import frappe


def execute() -> None:
	# Patches run before after_migrate creates the custom field; on a site
	# without it there is no Envision Project, so nothing to backfill.
	if not frappe.db.has_column("Project", "envision_enabled"):
		return

	task = frappe.qb.DocType("Task")
	project = frappe.qb.DocType("Project")
	envision_projects = frappe.qb.from_(project).select(project.name).where(project.envision_enabled == 1)

	# Turning is_group on is always valid (NestedSet only refuses turning it off
	# on a Task with children), so a direct update skips nothing. Leaves
	# modified alone: a backfill, not an edit.
	(
		frappe.qb.update(task)
		.set(task.is_group, 1)
		.where(task.project.isin(envision_projects))
		.where(task.is_milestone == 0)
		.where(task.is_template == 0)
		.where(task.is_group == 0)
	).run()
	frappe.clear_document_cache("Task")
