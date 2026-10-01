"""Custom Fields Envision adds to standard ERPNext DocTypes (ADR 0001).

Created on install and re-synced on every migrate, so the definition below is
the source of truth; edit here, then run ``bench --site <site> migrate``.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ENVISION_CUSTOM_FIELDS = {
	"Project": [
		{
			"fieldname": "envision_section",
			"fieldtype": "Section Break",
			"label": "Envision",
			"insert_after": "notes",
			"collapsible": 1,
		},
		{
			"fieldname": "envision_enabled",
			"fieldtype": "Check",
			"label": "Managed in Envision",
			"insert_after": "envision_section",
			"default": "0",
			"description": "Envision lists this project.",
		},
	],
	# A Task's Milestone and Module (CONTEXT.md). Both must belong to the Task's
	# own Project; setu.api.task.validate_task_links enforces that on every save,
	# Desk included.
	"Task": [
		{
			"fieldname": "envision_milestone",
			"fieldtype": "Link",
			"label": "Milestone",
			"options": "Task",
			"insert_after": "parent_task",
			"depends_on": "eval:!doc.is_milestone",
			"description": "A milestone Task in the same project.",
		},
		{
			"fieldname": "envision_module",
			"fieldtype": "Link",
			"label": "Module",
			"options": "Envision Module",
			"insert_after": "envision_milestone",
			"description": "The part of the project's product this Task belongs to.",
		},
		# An Archived Task (CONTEXT.md): hidden from Envision for thirty days,
		# then deleted for good by setu.api.task.delete_expired_archives.
		# Archiving a Task takes its whole subtree; each subtask records the
		# Task it went with, so restoring that one brings them all back.
		{
			"fieldname": "envision_archived_on",
			"fieldtype": "Datetime",
			"label": "Archived On",
			"insert_after": "envision_module",
			"read_only": 1,
			"no_copy": 1,
			"description": "Envision hides an archived Task and deletes it 30 days later.",
		},
		{
			"fieldname": "envision_archived_by",
			"fieldtype": "Link",
			"label": "Archived By",
			"options": "User",
			"insert_after": "envision_archived_on",
			"read_only": 1,
			"no_copy": 1,
			"depends_on": "eval:doc.envision_archived_on",
		},
		{
			"fieldname": "envision_archived_with",
			"fieldtype": "Link",
			"label": "Archived With",
			"options": "Task",
			"insert_after": "envision_archived_by",
			"read_only": 1,
			"no_copy": 1,
			"depends_on": "eval:doc.envision_archived_with",
			"description": "The parent Task whose archiving took this one.",
		},
	],
}


# Fields an earlier version created and no longer uses. The description now
# lives in ERPNext's own ``notes``, which already held its rendered HTML.
RETIRED_CUSTOM_FIELDS = ["Project-envision_description"]


def create_envision_custom_fields() -> None:
	create_custom_fields(ENVISION_CUSTOM_FIELDS)
	for name in RETIRED_CUSTOM_FIELDS:
		frappe.delete_doc_if_exists("Custom Field", name)
