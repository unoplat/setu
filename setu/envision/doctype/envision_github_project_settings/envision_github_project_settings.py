import frappe
from frappe.model.db_query import DatabaseQuery
from frappe.model.document import Document
from frappe.utils import now_datetime

from setu.github import projects

# One Project's route to one GitHub repository (docs/adr/0007). Generic
# DocType access is read-only, for System Managers who can read the Project,
# and the hooks below deny every generic write. (Frappe gives a DocType with no
# permission rows full System Manager access, so the JSON grants read only
# rather than nothing.) Routes change through setu.github.projects; any write
# that reaches this controller, Administrator's included, passes the same
# checks there.


class EnvisionGitHubProjectSettings(Document):
	def before_insert(self):
		# Server-controlled attribution: whatever a caller sent is replaced.
		self.connected_by = frappe.session.user
		self.connected_on = now_datetime()

	def validate(self):
		projects.validate_route_document(self)

	def on_trash(self):
		projects.require_route_permission(self.project)


def has_permission(doc, ptype="read", user=None) -> bool:
	"""Generic access is read-only and scoped to the route's Project. Any
	falsey return, including None, denies."""
	user = user or frappe.session.user
	if user == "Guest" or ptype not in ("read", "report"):
		return False
	return bool(doc.project and frappe.has_permission("Project", "read", doc=doc.project, user=user))


def get_permission_query_conditions(user=None):
	"""Desk, REST lists and reports obey the same Project scope as reads
	(the same subquery approach as Board Message)."""
	user = user or frappe.session.user
	if user == "Guest" or not frappe.has_permission("Project", "read", user=user):
		return "1=0"
	query = DatabaseQuery("Project", user=user).execute(
		fields=["name"], order_by="", limit_page_length=0, run=False
	)
	return f"`tabEnvision GitHub Project Settings`.`project` in ({query})"
