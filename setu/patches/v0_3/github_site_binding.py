"""Bind an existing GitHub connection to this site and database.

Issue sync pauses on a site whose binding differs (a restored or cloned copy)
until an admin confirms it in Settings (setu.github.connection.rebind_site).
Connections made before the binding existed get this site's binding once;
an existing binding is never replaced. Sync itself stays off: turning it on
is always an explicit Project-level action (docs/adr/0008).
"""

import frappe

from setu.github import connection

SETTINGS = "Envision GitHub Settings"


def execute() -> None:
	if not frappe.db.exists("DocType", SETTINGS):
		return
	if not frappe.db.get_single_value(SETTINGS, "app_id"):
		return
	if frappe.db.get_single_value(SETTINGS, "site_binding"):
		return
	frappe.db.set_single_value(SETTINGS, "site_binding", connection.site_binding())
