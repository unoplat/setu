"""Stable GitHub callback URLs and permission-checked GitHub endpoints.

The callback and webhook paths are registered in each site's GitHub App; do
not rename them. Project endpoints need Project read to view; changing a
Project's repository or sync needs System Manager or Projects Manager and
write access to the Project. Task endpoints need Task read to view and Task
write to act (docs/adr/0008).
"""

from collections.abc import Callable

import frappe
from frappe import _

from setu.api.task import task_doc
from setu.github import activation, connection, events, links, projects, store
from setu.github.activation import ProjectGitHub, SyncPreview
from setu.github.client import GitHubError
from setu.github.links import TaskGitHub


def manager_action(function, *args, **kwargs):
	connection.require_manager()
	with connection.connection_lock():
		try:
			result = function(*args, **kwargs)
			frappe.db.commit()
			return result
		except Exception as exc:
			frappe.db.rollback()
			if isinstance(exc, GitHubError):
				frappe.throw(_(str(exc)), frappe.ValidationError)
			raise


@frappe.whitelist(methods=["GET"])
def get_connection():
	return connection.get_connection()


@frappe.whitelist(methods=["POST"])
def start_app_creation(owner_type: str, organization: str = ""):
	return manager_action(connection.start_app_creation, owner_type, organization)


@frappe.whitelist(methods=["POST"])
def get_install_url():
	return {"url": manager_action(connection.install_url)}


@frappe.whitelist(methods=["POST"])
def refresh_connection():
	manager_action(connection.refresh_installations)
	return connection.get_connection()


@frappe.whitelist(methods=["POST"])
def confirm_site_url(setup_url_updated: bool = False):
	if not frappe.utils.cint(setup_url_updated):
		frappe.throw(_("Update the setup URL on GitHub before confirming the new site address."))
	manager_action(connection.rebind_site)
	return connection.get_connection()


@frappe.whitelist(methods=["POST"])
def disconnect():
	manager_action(connection.disconnect)
	return connection.get_connection()


@frappe.whitelist(methods=["GET"])
def manifest_callback(code: str | None = None, state: str | None = None):
	connection.require_manager()
	try:
		url = connection.complete_manifest(code, state)
	except Exception:
		# GitHub sends a one-time secret in the URL; never log the request or
		# conversion response, and never reflect exception details into a URL.
		frappe.db.rollback()
		return redirect_to_settings("registration_failed")
	redirect(url)


@frappe.whitelist(methods=["GET"])
def setup_callback(
	installation_id: str | None = None, state: str | None = None, setup_action: str | None = None
):
	connection.require_manager()
	try:
		result = manager_action(connection.complete_installation, installation_id, state, setup_action)
	except Exception:
		frappe.db.rollback()
		return redirect_to_settings("installation_failed")
	redirect_to_settings(result)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def webhook():
	return events.receive()


# Project: repository and sync.


def github_errors[T](function: Callable[..., T], *args: str | bool) -> T:
	"""Show a GitHub failure as a validation message; nothing is kept."""
	try:
		return function(*args)
	except GitHubError as exc:
		frappe.db.rollback()
		frappe.throw(_(str(exc)), frappe.ValidationError)


@frappe.whitelist(methods=["GET"])
def get_project_github(project: str) -> ProjectGitHub:
	"""The Project's repository and sync state, for anyone who can read it."""
	return activation.project_view(project)


@frappe.whitelist(methods=["GET"])
def list_project_repository_candidates(project: str) -> list[dict]:
	"""Repositories a manager could connect; never ones other Projects use."""
	return projects.list_repository_candidates(project)


@frappe.whitelist(methods=["POST"])
def connect_project_repository(project: str, repository: str) -> ProjectGitHub:
	"""Route the Project to a repository. Sync stays off until enabled."""
	projects.connect_repository(project, repository)
	return activation.project_view(project)


@frappe.whitelist(methods=["GET"])
def preview_project_sync(project: str) -> SyncPreview:
	return activation.preview(project)


@frappe.whitelist(methods=["POST"])
def enable_project_sync(
	project: str,
	acknowledge_private_data: bool = False,
	acknowledge_publication: bool = False,
	backlog_token: str = "",
) -> ProjectGitHub:
	return github_errors(
		activation.enable,
		project,
		acknowledge_private_data,
		acknowledge_publication,
		backlog_token,
	)


@frappe.whitelist(methods=["POST"])
def pause_project_sync(project: str) -> ProjectGitHub:
	return activation.set_paused(project, True)


@frappe.whitelist(methods=["POST"])
def resume_project_sync(project: str) -> ProjectGitHub:
	return activation.set_paused(project, False)


@frappe.whitelist(methods=["POST"])
def disconnect_project_repository(project: str) -> ProjectGitHub:
	"""Clear the route. Links pause and keep their Issues; nothing is deleted."""
	projects.clear_repository(project)
	return activation.project_view(project)


@frappe.whitelist(methods=["POST"])
def retry_project_sync(project: str) -> ProjectGitHub:
	"""Retry the Project's failed imports and failed Task syncs, and a failed
	import of the repository's Issues at activation. A link whose state changed
	meanwhile is skipped rather than failing the rest."""
	projects.require_route_permission(project)
	for name in frappe.get_all(
		store.ISSUE_SYNC, filters={"project": project, "sync_state": "Error"}, pluck="name"
	):
		store.attempt(retry_link, name)
	route = projects.route_for(project=project)
	if route:
		state = frappe.db.get_value(connection.PROJECT_ROUTE, route["name"], "activation_import_state")
		if state == "Failed":
			frappe.db.set_value(connection.PROJECT_ROUTE, route["name"], "activation_import_state", "Queued")
			# It resumes from the page it stopped on.
			activation.enqueue_import(project)
	return activation.project_view(project)


# Task: link state and actions.


@frappe.whitelist(methods=["GET"])
def get_task_github(task: str) -> TaskGitHub:
	return links.task_projection(task_doc(task))


@frappe.whitelist(methods=["POST"])
def retry_task_sync(task: str) -> TaskGitHub:
	"""Retry now. An uncertain create still looks for its Issue first."""
	doc = task_doc(task, "write")
	retry_link(require_link(doc.name))
	return links.task_projection(doc)


@frappe.whitelist(methods=["POST"])
def resume_task_sync(task: str) -> TaskGitHub:
	"""Resume a paused Task: both sides are compared first."""
	doc = task_doc(task, "write")
	links.resume(require_link(doc.name))
	return links.task_projection(doc)


@frappe.whitelist(methods=["POST"])
def resolve_task_conflict(task: str, field: str, choice: str) -> TaskGitHub:
	"""Keep Envision's or GitHub's value of one field. The next sync applies
	it through the normal Task save and records who chose."""
	doc = task_doc(task, "write")
	if field == "description":
		frappe.throw(_("Descriptions sync automatically and do not need a manual choice."))
	link = frappe.get_doc(store.ISSUE_SYNC, require_link(doc.name), for_update=True)
	row = next((row for row in link.conflicts if row.field == field), None)
	if not row:
		frappe.throw(_("This conflict was already resolved."))
	if choice not in links.allowed_choices():
		frappe.throw(_("Choose Keep Envision or Keep GitHub."))
	row.resolution = choice
	row.resolved_by = frappe.session.user
	link.save(ignore_permissions=True)
	store.queue_op(link.name, "reconcile", link.project)
	return links.task_projection(doc)


def require_link(task: str) -> str:
	link = links.link_for_task(task)
	if not link:
		frappe.throw(_("This task isn't linked to GitHub."))
	return link.name


def retry_link(name: str) -> None:
	link = frappe.db.get_value(
		store.ISSUE_SYNC, name, ["project", "sync_state", "issue_id", "task"], as_dict=True, for_update=True
	)
	if link.sync_state not in store.ACTIVE_STATES:
		frappe.throw(_("Resume this task's GitHub sync instead."))
	store.retry_ops(name)
	if link.sync_state == "Error":
		frappe.db.set_value(
			store.ISSUE_SYNC,
			name,
			{"sync_state": "Synced" if link.issue_id and link.task else "Pending", "error": None},
		)
	if not link.task:
		store.queue_op(name, "import_issue", link.project)
	else:
		store.queue_op(name, "reconcile" if link.issue_id else "create_issue", link.project)


def redirect_to_settings(result: str):
	# A same-origin relative redirect avoids depending on an incoming Host header.
	redirect(f"/envision/settings?github_result={result}")


def redirect(url: str):
	frappe.local.response["type"] = "redirect"
	frappe.local.response["location"] = url
	frappe.local.response["http_status_code"] = 303
