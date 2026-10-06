import json

import frappe

from setu.envision.doctype.envision_view.envision_view import clean_filters

# Envision's Custom View endpoints (Paper: "Custom view journey", CV 01 to CV
# 07). A view is an Envision View record: one person's saved Task filters for a
# project's board or, with no project, for My tasks (docs/adr/0004). It is
# private to its creator; that rule is on the DocType (has_permission and the
# query conditions in hooks.py), so Desk and the REST API obey it too. The
# DocType's validate keeps the rules of each kind of view.

VIEW_FIELDS = ["name", "view_name", "project", "filters"]


@frappe.whitelist()
def list_views(project: str | None = None) -> list[dict]:
	"""This user's views on a project, or with no project their My tasks views,
	oldest first, as the sidebar lists them."""
	check_view_scope(project)
	rows = frappe.get_list(
		"Envision View",
		filters={"project": project or ("is", "not set"), "owner": frappe.session.user},
		fields=VIEW_FIELDS,
		order_by="creation asc",
		limit_page_length=0,
	)
	return [view_summary(row) for row in rows]


@frappe.whitelist(methods=["POST"])
def create_view(
	project: str | None = None, view_name: str | None = None, filters: dict | str | None = None
) -> dict:
	"""Save the board's filters as a view (CV 02 — Name the view), on a
	project's board or, with no project, on My tasks.

	Anyone who can read the project may keep views on it, and anyone who can
	read Tasks may keep My tasks views. POST only: the method writes, and
	Frappe commits after a successful POST.
	"""
	check_view_scope(project)
	doc = frappe.new_doc("Envision View")
	doc.project = project or None
	doc.view_name = view_name
	doc.filters = clean_filters(filters)
	doc.insert()
	return view_summary(doc.as_dict())


@frappe.whitelist(methods=["POST"])
def update_view(name: str, view_name: str | None = None, filters: dict | str | None = None) -> dict:
	"""Rename a view or save its changed filters (CV 05, CV 06).

	Only what was sent changes: ``None`` leaves a field as it is, and an empty
	``filters`` object saves a view with no filters. A view stays where it was
	made, on its project or on My tasks.
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
def delete_view(name: str) -> dict:
	"""Delete a view (CV 07). Only the view goes; no Task changes."""
	doc = view_doc(name, "delete")
	frappe.delete_doc("Envision View", name)
	return {"name": name, "view_name": doc.view_name}


def check_view_scope(project: str | None) -> None:
	"""A project's views need read access to the project. My tasks views need
	read access to Tasks, which is what My tasks lists."""
	if project:
		frappe.get_doc("Project", project).check_permission("read")
	else:
		frappe.has_permission("Task", "read", throw=True)


def view_doc(name: str, ptype: str = "read"):
	"""The Envision View, after the permission check (its creator only)."""
	doc = frappe.get_doc("Envision View", name)
	doc.check_permission(ptype)
	return doc


def view_summary(row: dict) -> dict:
	"""``project`` is None on a My tasks view, so a view can be opened from
	its name alone."""
	return {
		"name": row["name"],
		"view_name": row["view_name"],
		"project": row.get("project") or None,
		"filters": clean_filters(row.get("filters")),
	}


def delete_project_views(project: str) -> None:
	"""Remove everyone's views of a project as the project itself is deleted,
	and take it out of every My tasks view's project filter.

	A My tasks view left with no project in its filter goes too: the project
	was all it showed, and an empty filter would show every project instead.
	Called from the Project's ``on_trash`` guard, which Frappe runs before it
	checks for linked records, so the views never block the delete. Views are
	private, and the person deleting the project rarely owns them all, hence
	``ignore_permissions``.
	"""
	for name in frappe.get_all("Envision View", filters={"project": project}, pluck="name"):
		frappe.delete_doc("Envision View", name, ignore_permissions=True)
	for name, filters in views_filtering_on("project", project):
		filters["project"].remove(project)
		if filters["project"]:
			save_filters(name, filters)
		else:
			frappe.delete_doc("Envision View", name, ignore_permissions=True)


def rename_project_filters(doc, method, old: str, new: str, merge: bool) -> None:
	"""Project ``after_rename``: carry the new name into My tasks views'
	project filters. Frappe's rename already moved each view's ``project``."""
	rename_filter_value("project", old, new)


def rename_user_filters(doc, method, old: str, new: str, merge: bool) -> None:
	"""User ``after_rename``: carry the new name into assignee filters. Frappe
	already moved each view's ``owner``."""
	rename_filter_value("assignee", old, new)


def rename_filter_value(field: str, old: str, new: str) -> None:
	"""Swap ``old`` for ``new`` in everyone's ``filters[field]``.

	Frappe's rename updates Link fields, such as a view's ``project`` and
	``owner``, but not the names inside its JSON ``filters``. ``new`` takes
	the place of the first of the two in the list, so a merge, or a view that
	already had ``new``, keeps it once. Written without touching ``modified``
	(the view itself did not change) and whoever owns it, as with the delete.
	"""
	for name, filters in views_filtering_on(field, old):
		values = []
		for value in filters[field]:
			value = new if value == old else value
			if value not in values:
				values.append(value)
		filters[field] = values
		save_filters(name, filters)


def views_filtering_on(field: str, value: str) -> list[tuple[str, dict[str, list[str]]]]:
	"""Everyone's views whose ``filters[field]`` holds ``value``, each with
	its parsed filters.

	LIKE narrows the rows on the stored JSON, where ``value`` is spelled as
	``frappe.as_json`` writes it (non-ASCII escaped); the exact match is on the
	parsed filters.
	"""
	encoded = json.dumps(value)
	# LIKE's escape character first, then its wildcards.
	for char in ("\\", "%", "_"):
		encoded = encoded.replace(char, "\\" + char)
	rows = frappe.get_all(
		"Envision View",
		filters={"filters": ["like", f"%{encoded}%"]},
		fields=["name", "filters"],
	)
	matches = []
	for row in rows:
		filters = clean_filters(row.filters)
		if value in filters.get(field, []):
			matches.append((row.name, filters))
	return matches


def save_filters(name: str, filters: dict[str, list[str]]) -> None:
	"""Store filters as the DocType's validate does, without its other checks."""
	frappe.db.set_value(
		"Envision View",
		name,
		"filters",
		frappe.as_json(clean_filters(filters), indent=None),
		update_modified=False,
	)
