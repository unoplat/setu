import frappe
from frappe.model.db_query import DatabaseQuery
from frappe.model.document import Document
from frappe.query_builder import Interval
from frappe.query_builder.functions import Now

# Durable GitHub sync work (setu.github.store). Generic access is read-only
# and scoped to readable Projects; operations hold identifiers, state and safe
# errors only, never Task or Issue content.


class EnvisionGitHubOperation(Document):
	@staticmethod
	def clear_old_logs(days=30):
		# Frappe's Log Settings only enrolls controllers exposing this method.
		# Open and failed work is kept until it finishes or is retried.
		table = frappe.qb.DocType("Envision GitHub Operation")
		frappe.db.delete(
			table,
			filters=(
				(table.modified < (Now() - Interval(days=days))) & table.status.isin(["Done", "Cancelled"])
			),
		)


def has_permission(doc, ptype="read", user=None) -> bool:
	user = user or frappe.session.user
	if user == "Guest" or ptype not in ("read", "report"):
		return False
	return bool(doc.project and frappe.has_permission("Project", "read", doc=doc.project, user=user))


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if user == "Guest" or not frappe.has_permission("Project", "read", user=user):
		return "1=0"
	query = DatabaseQuery("Project", user=user).execute(
		fields=["name"], order_by="", limit_page_length=0, run=False
	)
	return f"`tabEnvision GitHub Operation`.`project` in ({query})"
