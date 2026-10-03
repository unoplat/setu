import frappe
from frappe import _

from setu.envision.doctype.envision_view.envision_view import clean_filters

# Envision's Custom View endpoints (Paper: "Custom view journey", CV 01 to CV
# 07). A view is an Envision View record: one person's saved Task filters for a
# project's board (docs/adr/0004). It is private to its creator; that rule is
# on the DocType (has_permission and the query conditions in hooks.py), so Desk
# and the REST API obey it too.

VIEW_FIELDS = ["name", "view_name", "filters"]


@frappe.whitelist()
def list_views(project: str) -> list[dict]:
	"""This user's views on a project, oldest first, as the sidebar lists them."""
	frappe.get_doc("Project", project).check_permission("read")
	rows = frappe.get_list(
		"Envision View",
		filters={"project": project, "owner": frappe.session.user},
		fields=VIEW_FIELDS,
		order_by="creation asc",
		limit_page_length=0,
	)
	return [view_summary(row) for row in rows]


@frappe.whitelist(methods=["POST"])
def create_view(project: str, view_name: str, filters: dict | str | None = None) -> dict:
	"""Save the board's filters as a view (CV 02 — Name the view).

	Anyone who can read the project may keep views on it. POST only: the
	method writes, and Frappe commits after a successful POST.
	"""
	frappe.get_doc("Project", project).check_permission("read")
	doc = frappe.new_doc("Envision View")
	doc.project = project
	doc.view_name = view_name
	doc.filters = clean_filters(filters)
	doc.insert()
	return view_summary(doc.as_dict())


@frappe.whitelist(methods=["POST"])
def update_view(name: str, view_name: str | None = None, filters: dict | str | None = None) -> dict:
	"""Rename a view or save its changed filters (CV 05, CV 06).

	Only what was sent changes: ``None`` leaves a field as it is, and an empty
	``filters`` object saves a view with no filters.
	"""
	doc = view_doc(name, "write")
	if view_name is not None:
		doc.view_name = view_name
	if filters is not None:
		doc.filters = clean_filters(filters)
	if view_name is not None or filters is not None:
		doc.save()
	return view_summary(doc.as_dict())


@frappe.whitelist(methods=["POST"])
def duplicate_view(name: str) -> dict:
	"""Copy a view under the next free name: "Urgent copy", "Urgent copy 2"."""
	source = view_doc(name)
	taken = {
		other.casefold()
		for other in frappe.get_all(
			"Envision View",
			filters={"project": source.project, "owner": frappe.session.user},
			pluck="view_name",
		)
	}
	copy_name = _("{0} copy").format(source.view_name)
	number = 2
	while copy_name.casefold() in taken:
		copy_name = _("{0} copy {1}").format(source.view_name, number)
		number += 1
	doc = frappe.new_doc("Envision View")
	doc.project = source.project
	doc.view_name = copy_name
	doc.filters = clean_filters(source.filters)
	doc.insert()
	return view_summary(doc.as_dict())


@frappe.whitelist(methods=["POST"])
def delete_view(name: str) -> dict:
	"""Delete a view (CV 07). Only the view goes; no Task changes."""
	doc = view_doc(name, "delete")
	frappe.delete_doc("Envision View", name)
	return {"name": name, "view_name": doc.view_name}


def view_doc(name: str, ptype: str = "read"):
	"""The Envision View, after the permission check (its creator only)."""
	doc = frappe.get_doc("Envision View", name)
	doc.check_permission(ptype)
	return doc


def view_summary(row: dict) -> dict:
	return {
		"name": row["name"],
		"view_name": row["view_name"],
		"filters": clean_filters(row.get("filters")),
	}


def delete_project_views(project: str) -> None:
	"""Remove everyone's views of a project as the project itself is deleted.

	Called from the Project's ``on_trash`` guard, which Frappe runs before it
	checks for linked records, so the views never block the delete.
	"""
	for name in frappe.get_all("Envision View", filters={"project": project}, pluck="name"):
		frappe.delete_doc("Envision View", name, ignore_permissions=True)
