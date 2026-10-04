import frappe
from frappe import _

from setu.api.module import summary
from setu.api.timeline import comment_on, document_activity, people_details, timestamp
from setu.setup.link_types import BUILT_IN_LINK_TYPES

# Envision's Link endpoints (Paper: "User Journey — Project Links", Links 01
# to 07). A link is an Envision Link record (setu/envision/doctype/envision_link)
# with an Envision Link Type, shared by every project (docs/adr/0005). Their
# rules (an http or https address, its host, one type per name, an icon from
# the list) live on the DocTypes, so Desk and the REST API obey them too.
# Envision only stores the address: it never fetches it.

LINK_FIELDS = ["name", "link_name", "url", "host", "description", "link_type", "creation", "modified"]
LINK_TYPE_FIELDS = ["name", "type_name", "icon", "is_standard"]

# Built-in types in the order Envision ships them, then people's own by name.
BUILT_IN_ORDER = {type_name: index for index, (type_name, _icon) in enumerate(BUILT_IN_LINK_TYPES)}


@frappe.whitelist()
def list_links(project: str) -> list[dict]:
	"""A project's links, oldest first so a new door joins the end of the
	board (Paper: Links 01 — Empty, 04 — Doors)."""
	frappe.get_doc("Project", project).check_permission("read")
	rows = frappe.get_list(
		"Envision Link",
		filters={"project": project},
		fields=LINK_FIELDS,
		order_by="creation asc",
		limit_page_length=0,
	)
	types = link_types({row.link_type for row in rows})
	return [link_summary(row, types) for row in rows]


@frappe.whitelist()
def get_link(name: str) -> dict:
	"""One link and its project's title (Paper: Links 04a — Link detail)."""
	return link_detail(link_doc(name))


@frappe.whitelist(methods=["POST"])
def create_link(
	project: str,
	link_name: str,
	url: str,
	link_type: str,
	description: str | None = None,
) -> dict:
	"""Add a link to a project (Paper: Links 02 — Add, 03 — Link added).

	- The description arrives as HTML from Envision's rich text editor; Frappe
	  sanitizes it on save like any Text Editor value.
	- Anyone who can read the project may add a link to it, as with modules;
	  the Envision Link's own create permission still applies.
	- POST only: the method writes, and Frappe commits after a successful POST.
	"""
	doc = frappe.new_doc("Envision Link")
	doc.project = require_project(project)
	doc.link_name = require_link_name(link_name)
	doc.url = url
	doc.link_type = require_link_type(link_type)
	doc.description = (description or "").strip()
	doc.insert()
	return link_summary(doc.as_dict(), link_types({doc.link_type}))


@frappe.whitelist(methods=["POST"])
def update_link(
	name: str,
	link_name: str | None = None,
	url: str | None = None,
	link_type: str | None = None,
	description: str | None = None,
	project: str | None = None,
) -> dict:
	"""Save what changed on the link (04a: each edit saves on its own).

	Only the fields that were sent change: ``None`` (not sent) leaves a field
	as it is, so an edit here never overwrites what someone else changed in
	Desk meanwhile. Only the description can be cleared with ``""``: a link
	always has a name, an address, a type and a project.

	Moving a link asks what adding one does of its new project: that this user
	can read it.
	"""
	doc = link_doc(name, "write")
	if link_name is not None:
		doc.link_name = require_link_name(link_name)
	if url is not None:
		doc.url = url
	if link_type is not None:
		doc.link_type = require_link_type(link_type)
	if description is not None:
		doc.description = description.strip()
	if project is not None:
		doc.project = require_project(project)
	if any(value is not None for value in (link_name, url, link_type, description, project)):
		doc.save()
	return link_detail(doc)


@frappe.whitelist()
def get_link_activity(name: str) -> dict:
	"""The link's timeline (04a: "Activity")."""
	return document_activity(link_doc(name))


@frappe.whitelist(methods=["POST"])
def add_link_comment(name: str, content: str) -> dict:
	"""Comment on a link (04a: "Comment"), as Desk's timeline does."""
	return comment_on(link_doc(name, "read"), content)


@frappe.whitelist(methods=["POST"])
def delete_link(name: str) -> dict:
	"""Delete a link for good (Paper: Links 05 — Door actions, 06 — Confirm
	delete). Frappe's own delete checks the Envision Link delete permission
	and removes its comments with it."""
	doc = link_doc(name, "delete")
	frappe.delete_doc("Envision Link", name)
	return {"name": name, "link_name": doc.link_name}


@frappe.whitelist()
def list_link_types() -> list[dict]:
	"""Every link type for the type picker (Paper: Links 02 — Add): the
	built-in ones first, then people's own by name."""
	rows = frappe.get_list("Envision Link Type", fields=LINK_TYPE_FIELDS, limit_page_length=0)
	rows.sort(
		key=lambda row: (
			BUILT_IN_ORDER.get(row.name, len(BUILT_IN_ORDER)) if row.is_standard else len(BUILT_IN_ORDER),
			row.type_name.casefold(),
		)
	)
	return [link_type_summary(row) for row in rows]


@frappe.whitelist(methods=["POST"])
def create_link_type(type_name: str, icon: str) -> dict:
	"""Add a link type from the link form (Paper: Links 02a — Create custom
	type). It is offered in every project from then on. The DocType refuses a
	name already taken, whatever the case, and an icon not in its list."""
	doc = frappe.new_doc("Envision Link Type")
	doc.type_name = type_name
	doc.icon = icon
	doc.insert()
	return link_type_summary(doc.as_dict())


def link_doc(name: str, ptype: str = "read"):
	"""The Envision Link, after the permission check."""
	doc = frappe.get_doc("Envision Link", name)
	doc.check_permission(ptype)
	return doc


def link_detail(doc) -> dict:
	people = people_details({doc.owner})
	return {
		**link_summary(doc.as_dict(), link_types({doc.link_type})),
		"project": doc.project,
		"project_name": frappe.db.get_value("Project", doc.project, "project_name"),
		"owner": doc.owner,
		"added_by": people.get(doc.owner),
		# Read-only viewers see the screen without Save or the editor.
		"can_write": bool(doc.has_permission("write")),
	}


def link_summary(row: dict, types: dict[str, dict]) -> dict:
	description = row.get("description") or ""
	return {
		"name": row["name"],
		"link_name": row["link_name"],
		"url": row["url"],
		"host": row.get("host") or "",
		"description": description,
		# The door shows the opening words as plain text, as the modules table does.
		"summary": summary(description),
		"link_type": types.get(row["link_type"]),
		"creation": timestamp(row["creation"]),
		"modified": timestamp(row["modified"]),
	}


def link_types(names: set[str]) -> dict[str, dict]:
	"""The given link types by name. Types are shared by every project, so a
	link this user may read shows its type whatever the type's permissions."""
	if not names:
		return {}
	return {
		row.name: link_type_summary(row)
		for row in frappe.get_all(
			"Envision Link Type", filters={"name": ("in", list(names))}, fields=LINK_TYPE_FIELDS
		)
	}


def link_type_summary(row: dict) -> dict:
	return {
		"name": row["name"],
		"type_name": row["type_name"],
		"icon": row["icon"],
		"is_standard": bool(row.get("is_standard")),
	}


def require_link_name(link_name: str | None) -> str:
	link_name = (link_name or "").strip()
	if not link_name:
		frappe.throw(_("Link name is required"), frappe.MandatoryError)
	return link_name


def require_link_type(link_type: str | None) -> str:
	if not link_type:
		frappe.throw(_("Choose a type for the link"), frappe.MandatoryError)
	return link_type


def require_project(project: str | None) -> str:
	"""A project this user can read, for a link to be added to or moved to."""
	if not project:
		frappe.throw(_("A link belongs to a project"), frappe.MandatoryError)
	frappe.get_doc("Project", project).check_permission("read")
	return project


def delete_project_links(project: str) -> None:
	"""Remove a project's links as the project itself is deleted.

	Called from the Project's ``on_trash`` guard, which Frappe runs before it
	checks for linked records, so the links never block the delete. Their
	types stay: they belong to every project.
	"""
	for name in frappe.get_all("Envision Link", filters={"project": project}, pluck="name"):
		frappe.delete_doc("Envision Link", name, ignore_permissions=True)
