"""Membership-based access to Envision projects.

ERPNext's role permissions let every "Projects User" read every Project. For
projects managed in Envision (``envision_enabled = 1``) that is too open: only
the creator, the members listed in the ``Project User`` child table, and site
admins may see the project. Projects created outside Envision keep ERPNext's
own rules, so installing the app does not hide existing data.

Both hooks are registered in hooks.py and therefore apply to every access
path (Desk list views, REST, reports, the Envision SPA), as required by ADR
0001.
"""

import frappe

# Roles that see every Envision project regardless of membership.
ADMIN_ROLES = frozenset({"System Manager", "Projects Manager"})


def is_project_admin(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	return bool(ADMIN_ROLES.intersection(frappe.get_roles(user)))


def get_permission_query_conditions(user: str | None = None, doctype: str | None = None) -> str | None:
	"""SQL fragment ANDed into every Project list query for ``user``."""
	user = user or frappe.session.user
	if is_project_admin(user):
		return None

	escaped = frappe.db.escape(user)
	return (
		"(ifnull(`tabProject`.envision_enabled, 0) = 0"
		f" or `tabProject`.owner = {escaped}"
		" or `tabProject`.name in ("
		"select `parent` from `tabProject User`"
		f" where `parenttype` = 'Project' and `user` = {escaped}))"
	)


def has_permission(doc, ptype: str = "read", user: str | None = None, debug: bool = False) -> bool:
	"""Deny access to an Envision project for non-members. Frappe only lets
	controller hooks deny, never grant, so returning True defers to roles."""
	user = user or frappe.session.user
	if not doc.get("envision_enabled") or is_project_admin(user):
		return True
	if doc.get("owner") == user:
		return True
	return any(row.user == user for row in (doc.get("users") or []))
