import frappe
from frappe.model.db_query import DatabaseQuery
from frappe.model.document import Document

# One Task's link to one GitHub Issue (docs/adr/0008). It holds the Task's and
# Issue's last synchronized values and open conflicts, so generic DocType
# access is read-only (System Manager in the JSON) and narrowed by the hooks
# below to people who can read the Task, or the Project for a tombstone.
# Links change only through setu.github; the Envision UI reads
# setu.api.github.get_task_github, which checks Task access itself.


class EnvisionGitHubIssueSync(Document):
	pass


def has_permission(doc, ptype="read", user=None) -> bool:
	"""Read-only, scoped to the Task (or, once it is deleted, the Project).
	Any falsey return, including None, denies."""
	user = user or frappe.session.user
	if user == "Guest" or ptype not in ("read", "report"):
		return False
	if doc.task:
		return bool(frappe.has_permission("Task", "read", doc=doc.task, user=user))
	return bool(doc.project and frappe.has_permission("Project", "read", doc=doc.project, user=user))


def get_permission_query_conditions(user=None):
	"""Desk, REST lists and reports obey the same scope as reads: Frappe builds
	the Task and Project subqueries, user permissions and sharing included."""
	user = user or frappe.session.user
	if user == "Guest" or not frappe.has_permission("Task", "read", user=user):
		return "1=0"
	tasks = DatabaseQuery("Task", user=user).execute(
		fields=["name"], order_by="", limit_page_length=0, run=False
	)
	table = "`tabEnvision GitHub Issue Sync`"
	if not frappe.has_permission("Project", "read", user=user):
		return f"{table}.`task` in ({tasks})"
	projects = DatabaseQuery("Project", user=user).execute(
		fields=["name"], order_by="", limit_page_length=0, run=False
	)
	return f"({table}.`task` in ({tasks}) or ({table}.`task` is null and {table}.`project` in ({projects})))"
