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
from setu.github import activation, connection, delta, events, links, projects, retry
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
	acknowledge_deletion: bool = False,
	backlog_token: str = "",
) -> ProjectGitHub:
	return github_errors(
		activation.enable,
		project,
		acknowledge_private_data,
		acknowledge_publication,
		acknowledge_deletion,
		backlog_token,
	)


@frappe.whitelist(methods=["POST"])
def disable_project_sync(project: str) -> ProjectGitHub:
	return activation.disable(project)


@frappe.whitelist(methods=["POST"])
def disconnect_project_repository(project: str) -> ProjectGitHub:
	"""Clear the route, which turns sync off. Links keep their Issues; nothing is deleted."""
	projects.clear_repository(project)
	return activation.project_view(project)


@frappe.whitelist(methods=["POST"])
def retry_project_sync(project: str) -> ProjectGitHub:
	"""Bring forward everything waiting in the Project, and a failed import of the
	repository's Issues. A row that is running now is left to finish."""
	projects.require_route_permission(project)
	route = projects.route_for(project=project)
	if not route or not route["sync_enabled"]:
		frappe.throw(_("Turn on GitHub sync for this project first."))
	activation.retry_project(route)
	return activation.project_view(project)


# Task: link state and actions.


@frappe.whitelist(methods=["GET"])
def get_task_github(task: str) -> TaskGitHub:
	return links.task_projection(task_doc(task))


@frappe.whitelist(methods=["POST"])
def retry_task_sync(task: str) -> TaskGitHub:
	"""Retry now. An uncertain create still looks for its Issue first."""
	doc = task_doc(task, "write")
	link = links.link_for_task(doc.name)
	if not link:
		frappe.throw(_("This task isn't linked to GitHub."))
	if not links.can_retry(link, projects.route_for(project=link.project)):
		frappe.throw(_("This task has no GitHub sync to retry right now."))
	retry_link(link)
	return links.task_projection(doc)


def retry_link(link: frappe._dict) -> None:
	"""The link's Retry Job rows come due, with the same delta, and keys on link.delta
	with no outbound row get their job. Commits: the enqueue runs after commit, and its
	failure moves the keys to a row (``activation.enqueue_waiting``)."""
	retry.make_due(links.retry_jobs(link))
	frappe.db.commit()
	if delta.parse_delta(link.delta) and not links.outbound_job(link.name):
		activation.enqueue_waiting(link)


def redirect_to_settings(result: str):
	# A same-origin relative redirect avoids depending on an incoming Host header.
	redirect(f"/envision/settings?github_result={result}")


def redirect(url: str):
	frappe.local.response["type"] = "redirect"
	frappe.local.response["location"] = url
	frappe.local.response["http_status_code"] = 303
