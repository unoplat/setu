"""Undo what Envision changed on standard ERPNext records (ADR 0001)."""

import frappe


def before_uninstall() -> None:
	# Blocked is Envision's status; without Envision the Task's status options
	# no longer offer it, so those Tasks go back to Open.
	frappe.db.set_value("Task", {"status": "Blocked"}, "status", "Open", update_modified=False)
