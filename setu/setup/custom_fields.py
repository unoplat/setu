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
	],
	# A reply quotes one whole comment on the same record; comments stay flat,
	# never threads. The quote is copied when the reply is posted, so it keeps
	# the words that were answered after the original is edited or deleted
	# (setu.api.timeline.validate_quote and release_quotes).
	"Comment": [
		{
			"fieldname": "envision_quote_section",
			"fieldtype": "Section Break",
			"label": "Quoted comment",
			"insert_after": "content",
			"collapsible": 1,
		},
		{
			"fieldname": "envision_reply_to",
			"fieldtype": "Link",
			"label": "Reply To",
			"options": "Comment",
			"insert_after": "envision_quote_section",
			"read_only": 1,
			"no_copy": 1,
			"search_index": 1,
			"description": "The comment this one answers. Cleared when that comment is deleted.",
		},
		{
			"fieldname": "envision_quote_owner",
			"fieldtype": "Data",
			"label": "Quoted Author",
			"insert_after": "envision_reply_to",
			"read_only": 1,
			"no_copy": 1,
		},
		{
			"fieldname": "envision_quote_creation",
			"fieldtype": "Datetime",
			"label": "Quoted Comment Posted On",
			"insert_after": "envision_quote_owner",
			"read_only": 1,
			"no_copy": 1,
		},
		{
			"fieldname": "envision_quote_content",
			"fieldtype": "Long Text",
			"label": "Quoted Comment",
			"insert_after": "envision_quote_creation",
			"read_only": 1,
			"no_copy": 1,
		},
	],
}


# Fields earlier versions created and no longer use. Previously archived
# Tasks are retained as ordinary Tasks, not silently deleted during an upgrade.
# The description lives in ERPNext's own ``notes``.
RETIRED_CUSTOM_FIELDS = [
	"Project-envision_description",
	"Task-envision_archived_with",
	"Task-envision_archived_by",
	"Task-envision_archived_on",
]


def create_envision_custom_fields() -> None:
	create_custom_fields(ENVISION_CUSTOM_FIELDS)
	for name in RETIRED_CUSTOM_FIELDS:
		frappe.delete_doc_if_exists("Custom Field", name)
