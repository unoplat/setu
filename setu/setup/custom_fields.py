"""Custom Fields Envision adds to standard ERPNext DocTypes (ADR 0001).

Created on install and re-synced on every migrate, so the definition below is
the source of truth; edit here, then run ``bench --site <site> migrate``.
"""

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
			"description": "Envision lists this project and restricts it to its members.",
		},
		{
			"fieldname": "envision_description",
			"fieldtype": "Markdown Editor",
			"label": "Envision Description",
			"insert_after": "envision_enabled",
			"description": "Markdown edited in Envision. Notes above holds the rendered HTML.",
		},
	],
}


def create_envision_custom_fields() -> None:
	create_custom_fields(ENVISION_CUSTOM_FIELDS)
