import frappe
from frappe import _
from frappe.utils import strip_html

from setu.api.task import live_task_count
from setu.api.timeline import comment_on, document_activity, people_details, timestamp

# Envision's Module endpoints (Paper: "Create module journey", 07 to 07d). A
# module is an Envision Module record (setu/envision/doctype/envision_module),
# the one Envision-owned record type, since ERPNext has nothing for a lasting
# part of a product (docs/adr/0002). Its rules (a name, unique in its project)
# live on the DocType, so Desk and the REST API obey them too.

MODULE_FIELDS = ["name", "module_name", "description", "lead"]

# The table's Summary column is one line of plain text.
SUMMARY_LENGTH = 160


@frappe.whitelist()
def list_modules(project: str) -> list[dict]:
	"""A project's modules, by name (Paper: 07 — Empty Modules, 07c)."""
	frappe.get_doc("Project", project).check_permission("read")
	rows = frappe.get_list(
		"Envision Module",
		filters={"project": project},
		fields=MODULE_FIELDS,
		order_by="module_name asc",
		limit_page_length=0,
	)
	people = people_details({row.lead for row in rows if row.lead})
	return [module_summary(row, people) for row in rows]


@frappe.whitelist()
def get_module(name: str) -> dict:
	"""One module and its project's title (Paper: 07d — Module Detail)."""
	return module_detail(module_doc(name))


@frappe.whitelist(methods=["POST"])
def create_module(
	project: str,
	module_name: str,
	description: str | None = None,
	lead: str | None = None,
) -> dict:
	"""Create a module on a project (Paper: 07a — Create Module).

	- The description arrives as HTML from Envision's rich text editor; Frappe
	  sanitizes it on save like any Text Editor value.
	- Anyone who can read the project may add a module to it, as with
	  milestones; the Envision Module's own create permission still applies.
	- POST only: the method writes, and Frappe commits after a successful POST.
	"""
	doc = frappe.new_doc("Envision Module")
	doc.project = require_project(project)
	doc.module_name = require_module_name(module_name)
	doc.description = (description or "").strip()
	doc.lead = lead or None
	doc.insert()
	return module_summary(doc.as_dict(), people_details({doc.lead} if doc.lead else set()))


@frappe.whitelist(methods=["POST"])
def update_module(
	name: str,
	module_name: str | None = None,
	description: str | None = None,
	lead: str | None = None,
	project: str | None = None,
) -> dict:
	"""Save what changed on the module (07d: one "Save changes" for all).

	Only the fields that were sent change: ``None`` (not sent) leaves a field
	as it is, and ``""`` clears it, so an edit here never overwrites what
	someone else changed in Desk meanwhile. A module always has a project, so
	``project`` moves it and cannot clear it.

	Moving a module asks what creating one does of its new project: that this
	user can read it. The DocType's own rules still run on save, so a name
	already taken in the new project is refused there.
	"""
	doc = module_doc(name, "write")
	if module_name is not None:
		doc.module_name = require_module_name(module_name)
	if description is not None:
		doc.description = description.strip()
	if lead is not None:
		doc.lead = lead or None
	if project is not None:
		doc.project = require_project(project)
	if any(value is not None for value in (module_name, description, lead, project)):
		doc.save()
	return module_detail(doc)


@frappe.whitelist()
def get_module_activity(name: str) -> dict:
	"""The module's timeline (07d: "Activity")."""
	return document_activity(module_doc(name))


@frappe.whitelist(methods=["POST"])
def add_module_comment(name: str, content: str) -> dict:
	"""Comment on a module (07d: "Comment"), as Desk's timeline does."""
	return comment_on(module_doc(name, "read"), content)


@frappe.whitelist()
def count_module_tasks(name: str) -> dict:
	"""How many Tasks a delete would move to No module (Paper: Module Delete
	02). Counted as the Board shows them: neither Cancelled nor templates."""
	module_doc(name)
	return {"tasks": live_task_count({"envision_module": name})}


@frappe.whitelist(methods=["POST"])
def delete_module(name: str) -> dict:
	"""Delete a module for good (Paper: "Delete module journey").

	Its Tasks stay, under No module: the link is cleared on every one of them
	first, without touching ``modified`` so the
	Board's order holds. Frappe's own delete then checks the Envision Module
	delete permission and removes its comments with it.
	"""
	doc = module_doc(name, "delete")
	tasks = live_task_count({"envision_module": name})
	frappe.db.set_value("Task", {"envision_module": name}, "envision_module", None, update_modified=False)
	frappe.delete_doc("Envision Module", name)
	return {"name": name, "module_name": doc.module_name, "tasks": tasks}


def module_doc(name: str, ptype: str = "read"):
	"""The Envision Module, after the permission check."""
	doc = frappe.get_doc("Envision Module", name)
	doc.check_permission(ptype)
	return doc


def module_detail(doc) -> dict:
	row = doc.as_dict()
	return {
		**module_summary(row, people_details({doc.lead} if doc.lead else set())),
		"project": doc.project,
		"project_name": frappe.db.get_value("Project", doc.project, "project_name"),
		"owner": doc.owner,
		"creation": timestamp(doc.creation),
		"modified": timestamp(doc.modified),
		# Read-only viewers see the screen without Save or the editor.
		"can_write": bool(doc.has_permission("write")),
	}


def module_summary(row: dict, people: dict[str, dict]) -> dict:
	description = row.get("description") or ""
	return {
		"name": row["name"],
		"module_name": row["module_name"],
		"description": description,
		"summary": summary(description),
		"lead": people.get(row.get("lead") or ""),
	}


def summary(html: str) -> str:
	"""The description's opening words as one line of plain text."""
	text = " ".join(strip_html(html).split())
	if len(text) <= SUMMARY_LENGTH:
		return text
	return text[:SUMMARY_LENGTH].rsplit(" ", 1)[0].rstrip(".,;:") + "…"


def require_module_name(module_name: str | None) -> str:
	module_name = (module_name or "").strip()
	if not module_name:
		frappe.throw(_("Module name is required"), frappe.MandatoryError)
	return module_name


def require_project(project: str | None) -> str:
	"""A project this user can read, for a module to be created on or moved to."""
	if not project:
		frappe.throw(_("A module belongs to a project"), frappe.MandatoryError)
	frappe.get_doc("Project", project).check_permission("read")
	return project


def delete_project_modules(project: str) -> None:
	"""Remove a project's modules as the project itself is deleted.

	Called from the Project's ``on_trash`` guard, which Frappe runs before it
	checks for linked records, so the modules never block the delete.
	"""
	for name in frappe.get_all("Envision Module", filters={"project": project}, pluck="name"):
		frappe.delete_doc("Envision Module", name, ignore_permissions=True)
