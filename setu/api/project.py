import frappe
from frappe import _
from frappe.utils import md_to_html

@frappe.whitelist()
def create_project(project_name: str, description: str | None = None) -> dict:
	"""Create an Envision-managed ERPNext Project from the Create Project dialog.

	- Company is resolved server-side so the dialog never asks for it.
	- The description arrives as Markdown (MDXEditor). The source is kept in the
	  Envision custom field and the rendered HTML goes into ERPNext's ``notes``
	  so Desk users see the same text.
	- Access follows ERPNext's standard Project role permissions.
	"""
	project_name = (project_name or "").strip()
	if not project_name:
		frappe.throw(_("Project name is required"), frappe.MandatoryError)

	doc = frappe.new_doc("Project")
	doc.project_name = project_name
	doc.company = resolve_company()
	doc.envision_enabled = 1

	markdown = (description or "").strip()
	if markdown:
		doc.envision_description = markdown
		doc.notes = str(md_to_html(markdown) or "")

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
