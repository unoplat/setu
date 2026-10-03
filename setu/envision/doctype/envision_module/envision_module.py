import frappe
from frappe import _
from frappe.model.document import Document

# A Module is a lasting part of a project's product (Payments, Onboarding),
# with an optional lead and a description, and no status or dates. ERPNext has
# no record for this, so Envision owns it (docs/adr/0002). "Envision Module",
# not "Module", so it never reads as Frappe's own Module Def.


class EnvisionModule(Document):
	def validate(self):
		self.module_name = (self.module_name or "").strip()
		if not self.module_name:
			frappe.throw(_("Module name is required"), frappe.MandatoryError)
		self.validate_unique_name()

	def validate_unique_name(self):
		"""Journey guardrail "Missing or duplicate name": one name per project,
		whatever the case, so the table never lists two "Payments". Runs on
		every save, so moving a module to another project checks that one."""
		others = frappe.get_all(
			"Envision Module",
			filters={"project": self.project, "name": ("!=", self.name or "")},
			pluck="module_name",
		)
		if self.module_name.casefold() in {other.casefold() for other in others}:
			project_name = frappe.db.get_value("Project", self.project, "project_name") or self.project
			frappe.throw(
				_("A module named {0} already exists in {1}.").format(
					frappe.bold(self.module_name), frappe.bold(project_name)
				),
				frappe.DuplicateEntryError,
			)
