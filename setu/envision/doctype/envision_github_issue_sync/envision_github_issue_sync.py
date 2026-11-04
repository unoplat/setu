import frappe
from frappe import _
from frappe.model.db_query import DatabaseQuery
from frappe.model.document import Document

from setu.github import delta as github_delta

# One Task's link to one GitHub Issue (docs/adr/0008). It holds the Issue's
# identity and the sync work still pending, so generic DocType access is
# read-only (System Manager in the JSON) and narrowed by the hooks below to
# people who can read the Task, or the Project for a row whose Task was cleared.
# Links change only through setu.github; the Envision UI reads
# setu.api.github.get_task_github, which checks Task access itself.


class EnvisionGitHubIssueSync(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		create_requested_at: DF.Datetime | None
		delta: DF.JSON | None
		issue_node_id: DF.Data | None
		issue_number: DF.Int
		issue_url: DF.Data | None
		last_synced_at: DF.Datetime | None
		origin: DF.Literal["Envision", "GitHub"]
		project: DF.Link
		repository_full_name: DF.Data | None
		repository_id: DF.Data | None
		repository_provider_issue_id: DF.Data | None
		sync_state: DF.Literal[
			"not_synced", "synced", "to_be_updated", "cron_sync", "to_be_deleted", "unlinked"
		]
		task: DF.Link | None
	# end: auto-generated types

	def validate(self) -> None:
		# link.delta only ever holds Envision → GitHub work, and may be empty.
		entries = github_delta.parse_delta(self.delta)
		if entries is None:
			frappe.throw(_("Delta must be a JSON object of resources and actions."))
		elif unknown := github_delta.unknown_entries(entries, "outbound"):
			frappe.throw(_("Delta has entries outside its vocabulary: {0}").format(", ".join(unknown)))


def has_permission(doc, ptype="read", user=None) -> bool:
	"""Read-only, scoped to the Task (or, once it is cleared, the Project).
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
