import frappe
from frappe import _
from frappe.model.document import Document

# A Custom View (CONTEXT.md) is one person's saved set of Task filters, for a
# project's board or, with no project, for My tasks. ERPNext's Kanban Board
# record is shared, so Envision owns this one (docs/adr/0004). "Envision View"
# for the same reason as "Envision Module": it never reads as one of Frappe's
# own views.
#
# A null ``project`` is what makes a My tasks view; there is no scope field.
# My tasks is always "assigned to me", so its views never filter by assignee,
# and they alone may filter by project, since a project's board shows one.

# The Task fields a view can filter on, each holding the values it accepts.
FILTER_FIELDS = ("milestone", "priority", "assignee", "tag", "project")


class EnvisionView(Document):
	def validate(self):
		self.view_name = (self.view_name or "").strip()
		if not self.view_name:
			frappe.throw(_("View name is required"), frappe.MandatoryError)
		# Desk saves a cleared Link as "", and the uniqueness check counts on
		# null meaning My tasks.
		self.project = self.project or None
		filters = clean_filters(self.filters)
		if self.project:
			if filters.get("project"):
				frappe.throw(
					_("A project's view shows only that project, so it cannot filter by project."),
					frappe.ValidationError,
				)
		else:
			validate_my_tasks_filters(filters)
		self.filters = frappe.as_json(filters, indent=None)
		self.validate_unique_name()

	def validate_unique_name(self):
		"""One name per person within a project, and one among their My tasks
		views, whatever the case, so the sidebar never lists two "Urgent".
		Someone else's views do not count."""
		others = frappe.get_all(
			"Envision View",
			filters={
				"project": self.project or ("is", "not set"),
				"owner": self.owner or frappe.session.user,
				"name": ("!=", self.name or ""),
			},
			pluck="view_name",
		)
		if self.view_name.casefold() in {other.casefold() for other in others}:
			message = (
				_("You already have a view named {0} in this project.")
				if self.project
				else _("You already have a view named {0} in My tasks.")
			)
			frappe.throw(message.format(frappe.bold(self.view_name)), frappe.DuplicateEntryError)


def validate_my_tasks_filters(filters: dict[str, list[str]]) -> None:
	"""My tasks shows only the user's own Tasks, from Envision's projects."""
	if filters.get("assignee"):
		frappe.throw(
			_("My tasks always shows tasks assigned to you, so its views cannot filter by assignee."),
			frappe.ValidationError,
		)
	projects = filters.get("project") or []
	if not projects:
		return
	# The projects Envision lists (CONTEXT.md, Envision-enabled Project).
	enabled = set(
		frappe.get_all("Project", filters={"name": ["in", projects], "envision_enabled": 1}, pluck="name")
	)
	for project in projects:
		if project not in enabled:
			frappe.throw(
				_("{0} is not a project in Envision.").format(frappe.bold(project)),
				frappe.LinkValidationError,
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


def has_permission(doc, ptype="read", user=None) -> bool:
	"""Restrict, never grant: a view is its creator's alone, whatever the role
	(journey guardrail "Private to you"). True lets Frappe continue checking
	role and user permissions; any falsey return, including None, denies."""
	user = user or frappe.session.user
	if user == "Guest":
		return False
	if ptype == "create" or doc.is_new():
		return True
	return doc.owner == user


def get_permission_query_conditions(user=None):
	"""Desk lists, the REST API and reports show only one's own views."""
	user = user or frappe.session.user
	return f"`tabEnvision View`.`owner` = {frappe.db.escape(user)}"
