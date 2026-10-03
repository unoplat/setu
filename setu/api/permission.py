import frappe


def has_app_permission() -> bool:
	"""Show Envision to signed-in users who can read ERPNext Projects.

	This controls launcher visibility only; the frontend APIs still enforce
	DocType and document permissions on every request.
	"""
	return frappe.session.user != "Guest" and bool(frappe.has_permission("Project", "read"))
