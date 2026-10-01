"""Property Setters Envision applies to standard ERPNext DocTypes (ADR 0001).

Created on install and re-synced on every migrate, so the definition below is
the source of truth; edit here, then run ``bench --site <site> migrate``.
"""

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

# (doctype, property, value, property_type) set at DocType level.
ENVISION_DOCTYPE_PROPERTIES = [
	# Milestone and Task activity shows field changes ("changed Due Date from …
	# to …"), which Frappe only records as Versions when track_changes is on.
	("Task", "track_changes", "1", "Check"),
]

# ERPNext's Task statuses plus Envision's Blocked (CONTEXT.md, Status), placed
# with the other open statuses. setu.api.task.EnvisionTask keeps the daily
# overdue job from overwriting it, and uninstalling turns it back into Open.
TASK_STATUSES = "\n".join(
	[
		"Open",
		"Working",
		"Pending Review",
		"Blocked",
		"Overdue",
		"Template",
		"Completed",
		"Cancelled",
	]
)

# (doctype, fieldname, property, value, property_type) set on one field.
ENVISION_FIELD_PROPERTIES = [
	("Task", "status", "options", TASK_STATUSES, "Text"),
]


def create_envision_property_setters() -> None:
	for doctype, prop, value, property_type in ENVISION_DOCTYPE_PROPERTIES:
		name = f"{doctype}-main-{prop}"
		if frappe.db.get_value("Property Setter", name, "value") == value:
			continue
		make_property_setter(doctype, None, prop, value, property_type, for_doctype=True)
	for doctype, fieldname, prop, value, property_type in ENVISION_FIELD_PROPERTIES:
		name = f"{doctype}-{fieldname}-{prop}"
		if frappe.db.get_value("Property Setter", name, "value") == value:
			continue
		make_property_setter(doctype, fieldname, prop, value, property_type)
