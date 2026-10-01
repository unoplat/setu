import frappe
from frappe.utils import cint


@frappe.whitelist()
def list_assignees(limit: int = 100) -> list[dict]:
	"""People a milestone or a task can be assigned to.

	Frappe's assignment (the ToDo behind ``_assign``) only accepts Desk users,
	so the picker offers exactly those. Only the name and the avatar are
	returned, never contact details, and Guest never reaches a whitelisted
	method without ``allow_guest``.
	"""
	return frappe.get_all(
		"User",
		filters={"enabled": 1, "user_type": "System User"},
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc",
		limit=cint(limit) or 100,
	)
