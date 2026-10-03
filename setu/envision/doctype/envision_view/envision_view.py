import frappe
from frappe import _
from frappe.model.document import Document

# A Custom View (CONTEXT.md) is one person's saved set of Task filters for a
# project's board. ERPNext's Kanban Board record is shared, so Envision owns
# this one (docs/adr/0004). "Envision View" for the same reason as "Envision
# Module": it never reads as one of Frappe's own views.

# The Task fields a view can filter on, each holding the values it accepts.
FILTER_FIELDS = ("milestone", "priority", "assignee", "tag")


class EnvisionView(Document):
	def validate(self):
		self.view_name = (self.view_name or "").strip()
		if not self.view_name:
			frappe.throw(_("View name is required"), frappe.MandatoryError)
		if not self.project:
			frappe.throw(_("A view belongs to a project"), frappe.MandatoryError)
		self.filters = frappe.as_json(clean_filters(self.filters), indent=None)
		self.validate_unique_name()

	def validate_unique_name(self):
		"""One name per person and project, whatever the case, so the sidebar
		never lists two "Urgent". Someone else's views do not count."""
		others = frappe.get_all(
			"Envision View",
			filters={
				"project": self.project,
				"owner": self.owner or frappe.session.user,
				"name": ("!=", self.name or ""),
			},
			pluck="view_name",
		)
		if self.view_name.casefold() in {other.casefold() for other in others}:
			frappe.throw(
				_("You already have a view named {0} in this project.").format(frappe.bold(self.view_name)),
				frappe.DuplicateEntryError,
			)


def clean_filters(filters) -> dict[str, list[str]]:
	"""The filters as stored: known fields only, each a list of distinct,
	non-empty strings. Fields with nothing chosen are left out."""
	filters = frappe.parse_json(filters) if filters else {}
	if not isinstance(filters, dict):
		frappe.throw(_("A view's filters must be an object of lists"), frappe.ValidationError)
	cleaned: dict[str, list[str]] = {}
	for field in FILTER_FIELDS:
		values = filters.get(field) or []
		if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
			frappe.throw(_("A view's filters must be an object of lists"), frappe.ValidationError)
		distinct = list(dict.fromkeys(value for value in values if value))
		if distinct:
			cleaned[field] = distinct
	return cleaned


def has_permission(doc, ptype="read", user=None):
	"""Restrict, never grant: a view is its creator's alone, whatever the role
	(journey guardrail "Private to you"). Creating one needs nothing more than
	the DocType's own role permissions."""
	user = user or frappe.session.user
	if user == "Guest":
		return False
	if ptype == "create" or doc.is_new():
		return None
	return None if doc.owner == user else False


def get_permission_query_conditions(user=None):
	"""Desk lists, the REST API and reports show only one's own views."""
	user = user or frappe.session.user
	return f"`tabEnvision View`.`owner` = {frappe.db.escape(user)}"
