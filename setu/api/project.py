import frappe
from frappe import _


@frappe.whitelist()
def create_project(project_name: str, description: str | None = None) -> dict:
	"""Create an ERPNext Project from Envision's Create Project dialog.

	Envision never asks for a Company, so it is resolved here from the
	session user's defaults, then the site default, then the only Company on
	the site. Permissions are the standard Project create permission.
	"""
	project_name = (project_name or "").strip()
	if not project_name:
		frappe.throw(_("Project name is required"), frappe.MandatoryError)

	doc = frappe.new_doc("Project")
	doc.project_name = project_name
	doc.company = resolve_company()
	if description and description.strip():
		doc.notes = description.strip()
	doc.insert()
	return {"name": doc.name, "project_name": doc.project_name}


def resolve_company() -> str:
	company = frappe.defaults.get_user_default("Company") or frappe.defaults.get_global_default("company")
	if company:
		return company
	companies = frappe.get_all("Company", pluck="name", limit=2)
	if len(companies) == 1:
		return companies[0]
	frappe.throw(_("Set a default Company before creating projects."), title=_("No default Company"))
