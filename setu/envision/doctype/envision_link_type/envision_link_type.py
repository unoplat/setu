import frappe
from frappe import _
from frappe.model.document import Document

# A Link Type is a kind of project link (Docs, Observability) and the icon its
# card shows. Types are workspace-wide: one made in any project is offered in
# every project (docs/adr/0005). Envision seeds the built-in ones
# (setu/setup/link_types.py); people add their own from the link form. A type
# is named after its type name, which cannot change once it is saved.

# Lucide icon names a type may show. The icon field's options and the
# frontend's icon map list the same names.
ICON_KEYS = (
	"book-open",
	"video",
	"activity",
	"message-square",
	"pen-tool",
	"code",
	"link",
	"clipboard-list",
	"bug",
	"chart-line",
	"file-text",
	"server",
)


class EnvisionLinkType(Document):
	def before_insert(self):
		# Before Frappe names the record after it, so a blank name gets this
		# message rather than Frappe's own.
		self.type_name = require_type_name(self.type_name)

	def validate(self):
		self.type_name = require_type_name(self.type_name)
		if self.icon not in ICON_KEYS:
			frappe.throw(_("Choose an icon for the link type."), frappe.ValidationError)
		if self.is_new():
			self.validate_unique_name()

	def validate_unique_name(self):
		"""One type per name across the workspace, whatever the case, so the
		type picker never offers two "Docs"."""
		others = frappe.get_all("Envision Link Type", pluck="type_name")
		if self.type_name.casefold() in {other.casefold() for other in others}:
			frappe.throw(
				_("A link type named {0} already exists.").format(frappe.bold(self.type_name)),
				frappe.DuplicateEntryError,
			)

	def on_trash(self):
		"""A type still in use stays, in every project. Frappe would refuse
		too, as a linked record, but would name only one of the links."""
		links = frappe.db.count("Envision Link", {"link_type": self.name})
		if links:
			frappe.throw(
				_("{0} is still the type of {1} link(s). Give them another type, then try again.").format(
					frappe.bold(self.type_name), links
				),
				frappe.LinkExistsError,
			)


def require_type_name(type_name: str | None) -> str:
	type_name = (type_name or "").strip()
	if not type_name:
		frappe.throw(_("Type name is required"), frappe.MandatoryError)
	return type_name
