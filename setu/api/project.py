import frappe
from frappe import _

from setu.api.board_message import delete_project_messages
from setu.api.module import delete_project_modules
from setu.api.view import delete_project_views

# Envision's Project endpoints. Projects are standard ERPNext Projects (ADR
# 0001); Envision adds the ``envision_enabled`` flag, keeps the description in
# ERPNext's own ``notes``, and puts its two rules for deleting a project in the
# Project's ``on_trash`` (see ``guard_project_delete``) so they also hold for
# Desk and the REST API.

DELETE_ROLE = "Projects Manager"


class ProjectHasTasksError(frappe.ValidationError):
	"""Deleting is refused while the project still has tasks or subtasks."""


@frappe.whitelist(methods=["POST"])
def create_project(project_name: str, description: str | None = None) -> dict:
	"""Create an Envision-managed ERPNext Project from the Create Project dialog.

	- Company is resolved server-side so the dialog never asks for it.
	- The description arrives as HTML from Envision's rich text editor and is
	  stored in ERPNext's ``notes``, so Desk users see the same text and Envision
	  reopens it unchanged. Frappe sanitizes it on save like any Text Editor value.
	- Access follows ERPNext's standard Project role permissions.
	- POST only: the method writes, and Frappe commits after a successful POST.
	"""
	project_name = require_project_name(project_name)

	doc = frappe.new_doc("Project")
	doc.project_name = project_name
	doc.company = resolve_company()
	doc.envision_enabled = 1
	doc.notes = (description or "").strip()
	doc.insert()
	return {"name": doc.name, "project_name": doc.project_name}


@frappe.whitelist()
def get_project_settings(name: str) -> dict:
	"""What the Project Settings screen shows: the editable details plus the
	facts that decide whether the Danger zone is offered at all."""
	doc = frappe.get_doc("Project", name)
	doc.check_permission("read")
	return project_settings(doc)


@frappe.whitelist(methods=["POST"])
def update_project(name: str, project_name: str, description: str | None = None) -> dict:
	"""Save the General section of Project Settings. Returns the settings as
	saved, since Frappe's HTML cleaning may change the description slightly."""
	doc = frappe.get_doc("Project", name)
	doc.check_permission("write")
	doc.project_name = require_project_name(project_name)
	doc.notes = (description or "").strip()
	doc.save()
	return project_settings(doc)


@frappe.whitelist(methods=["POST"])
def delete_project(name: str) -> dict:
	"""Delete a Project from its Danger zone. ``guard_project_delete`` runs from
	``on_trash`` and refuses when the user may not, or when tasks remain."""
	doc = frappe.get_doc("Project", name)
	doc.check_permission("delete")
	frappe.delete_doc("Project", name)
	return {"name": name, "project_name": doc.project_name}


def guard_project_delete(doc, method=None) -> None:
	"""``on_trash`` hook for Project (hooks.py): only the project's creator or a
	Projects Manager may delete it, and only once it has no tasks. Its modules,
	board messages and everyone's views of it go with it."""
	if not user_may_delete(doc):
		frappe.throw(
			_("Only the project creator or a Projects Manager can delete {0}.").format(
				frappe.bold(doc.project_name)
			),
			frappe.PermissionError,
		)
	if task_count(doc.name):
		frappe.throw(
			_("{0} still has tasks. Move or delete them, then try again.").format(
				frappe.bold(doc.project_name)
			),
			ProjectHasTasksError,
		)
	# Modules and board messages belong to their project, and would otherwise
	# block the delete as linked records.
	delete_project_modules(doc.name)
	delete_project_messages(doc.name)
	delete_project_views(doc.name)


def project_settings(doc) -> dict:
	return {
		"name": doc.name,
		"project_name": doc.project_name,
		"description": doc.notes or "",
		"task_count": task_count(doc.name),
		"can_delete": user_may_delete(doc) and frappe.has_permission("Project", "delete", doc),
	}


def user_may_delete(doc) -> bool:
	user = frappe.session.user
	if user == "Guest":
		return False
	return user == "Administrator" or doc.owner == user or DELETE_ROLE in frappe.get_roles(user)


def task_count(project: str) -> int:
	"""Tasks and subtasks alike carry the project, so one count covers both."""
	return frappe.db.count("Task", {"project": project})


def require_project_name(project_name: str | None) -> str:
	project_name = (project_name or "").strip()
	if not project_name:
		frappe.throw(_("Project name is required"), frappe.MandatoryError)
	return project_name


def resolve_company() -> str:
	company = frappe.defaults.get_user_default("Company") or frappe.defaults.get_global_default("company")
	if company:
		return company
	companies = frappe.get_all("Company", pluck="name", limit=2)
	if len(companies) == 1:
		return companies[0]
	frappe.throw(_("Set a default Company before creating projects."), title=_("No default Company"))
