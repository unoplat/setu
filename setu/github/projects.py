"""Project ↔ repository routing: one Envision-enabled Project, one repository.

Routes are created with sync off (docs/adr/0007). Only
``setu.github.activation`` turns sync on, after the privacy and publication
acknowledgements (docs/adr/0008); ``validate_route_document`` refuses any
other change to ``sync_enabled``. The DocType controller calls
``validate_route_document`` and ``require_route_permission``, so Desk and REST
writes (which only Administrator can make) obey the same rules.

Concurrency. Writers lock rows in one order: the Project row, then the
repository row (``validate_route_document``). ``delete_project_route`` locks the
Project row and ``connection.disconnect`` locks every repository row before
deleting routes, so neither can miss a route inserted concurrently. The unique
indexes on ``project`` and ``repository`` are the final guard. The mutation
helpers here also hold ``connection.connection_lock`` and commit before
releasing it.
"""

import re

import frappe
from frappe import _

from setu.github import client, connection, store
from setu.github.client import GitHubError

PROJECT_ROUTE = connection.PROJECT_ROUTE
ROUTE_FIELDS = [
	"name",
	"project",
	"repository",
	"sync_enabled",
	"paused",
	"activated_on",
	"activated_at_utc",
]
MANAGER_ROLES = ("System Manager", "Projects Manager")
REPOSITORY_FIELDS = [
	"name",
	"full_name",
	"html_url",
	"private",
	"archived",
	"has_issues",
	"available",
	"installation",
]


def inactive_message(reason: str) -> str:
	# Why a saved route cannot carry Issues right now. A route survives every
	# one of these: losing access never deletes or reroutes it.
	# Translated when raised, not at import, so the user's language applies.
	return {
		"not_connected": _("Connect a GitHub repository to this project first."),
		"sync_not_enabled": _("GitHub sync is not turned on for this project yet."),
		"sync_paused": _("GitHub sync is paused for this project."),
		"site_binding_changed": _(
			"This site looks like a copy of the site that connected GitHub. Confirm it in GitHub settings before syncing."
		),
		"app_not_connected": _("Connect this site's GitHub App first."),
		"site_url_changed": _(
			"This site's address changed. Confirm the new address in GitHub settings first."
		),
		"project_missing": _("This project no longer exists."),
		"project_not_enabled": _("This project is not managed in Envision."),
		"repository_missing": _(
			"The GitHub App does not list this repository. Refresh GitHub settings and try again."
		),
		"repository_unavailable": _("The GitHub App can no longer access this repository."),
		"repository_archived": _("This repository is archived on GitHub."),
		"issues_disabled": _("Issues are turned off for this repository on GitHub."),
		"installation_removed": _("The GitHub App is no longer installed for this repository."),
		"installation_suspended": _("The GitHub App installation for this repository is suspended."),
		"installation_not_owned": _("This repository belongs to a different GitHub App installation."),
	}[reason]


def is_route_manager() -> bool:
	user = frappe.session.user
	if user == "Guest":
		return False
	return user == "Administrator" or bool(set(MANAGER_ROLES) & set(frappe.get_roles(user)))


def require_route_permission(project: str | None):
	"""Changing a route needs a manager role AND write access to the Project.

	A route whose Project is already gone (it should not exist; Project delete
	removes it) may still be removed by a manager, so it can never be stuck.
	"""
	if not is_route_manager():
		frappe.throw(
			_("Only a System Manager or Projects Manager can change a project's GitHub repository."),
			frappe.PermissionError,
		)
	if not project or not frappe.db.exists("Project", project):
		return None
	doc = frappe.get_doc("Project", project)
	if not frappe.has_permission("Project", "write", doc=doc):
		frappe.throw(
			_("You need write access to this project to change its GitHub repository."),
			frappe.PermissionError,
		)
	return doc


def validate_route_document(doc) -> None:
	"""The controller's ``validate``. New routes must be usable right now; a
	saved route is never re-validated against repository access, so losing
	access leaves it in place with an inactive reason."""
	if doc.is_new() and doc.sync_enabled:
		frappe.throw(_("Connect the repository first, then turn on sync."), frappe.ValidationError)
	if (
		not doc.is_new()
		and doc.has_value_changed("sync_enabled")
		and not doc.flags.envision_github_activation
	):
		# Only setu.github.activation, after both acknowledgements, sets it.
		frappe.throw(_("Turn GitHub sync on or off from Project Settings."), frappe.ValidationError)
	if not doc.is_new():
		# ``set_only_once`` keeps project and repository fixed: change a route
		# by clearing it and connecting again, never by editing it.
		require_route_permission(doc.project)
		return
	# Lock order: Project row, then repository row (see module docstring).
	project = frappe.db.get_value(
		"Project", doc.project, ["name", "envision_enabled"], as_dict=True, for_update=True
	)
	repository = frappe.db.get_value(
		connection.REPOSITORY, doc.repository, REPOSITORY_FIELDS, as_dict=True, for_update=True
	)
	require_route_permission(doc.project)
	reason = route_problem(project, repository)
	if reason:
		frappe.throw(inactive_message(reason), frappe.ValidationError)
	if frappe.db.exists(PROJECT_ROUTE, {"project": doc.project}):
		frappe.throw(
			_("This project is already connected to a repository. Disconnect it first."),
			frappe.DuplicateEntryError,
		)
	if frappe.db.exists(PROJECT_ROUTE, {"repository": doc.repository}):
		frappe.throw(
			_("This repository is already connected to another project."), frappe.DuplicateEntryError
		)


def route_problem(project: dict | None, repository: dict | None) -> str | None:
	"""The first reason a Project/repository pair cannot carry Issues, or None."""
	settings = client.settings()
	if not settings.app_id:
		return "app_not_connected"
	if settings.site_binding and settings.site_binding != connection.site_binding():
		return "site_binding_changed"
	try:
		if connection.public_url() != settings.site_url_at_creation:
			return "site_url_changed"
	except GitHubError:
		return "site_url_changed"
	if not project:
		return "project_missing"
	if not project.envision_enabled:
		return "project_not_enabled"
	if not repository:
		return "repository_missing"
	if not repository.available:
		return "repository_unavailable"
	if repository.archived:
		return "repository_archived"
	if not repository.has_issues:
		return "issues_disabled"
	installation = frappe.db.get_value(
		connection.INSTALLATION,
		repository.installation,
		["removed", "suspended", "account_id"],
		as_dict=True,
	)
	if not installation or installation.removed:
		return "installation_removed"
	if installation.suspended:
		return "installation_suspended"
	if installation.account_id != settings.owner_id:
		return "installation_not_owned"
	return None


def route_for(*, project: str | None = None, repository: str | None = None) -> dict | None:
	"""A saved route by Project or by repository ID, without permission checks.

	For internal callers only. ``routable`` says the pair could carry Issues
	now; sync also needs ``sync_enabled`` and not ``paused``. ``sync_blocker``
	combines all three.
	"""
	filters = {"project": project} if project else {"repository": repository}
	if not any(filters.values()):
		return None
	route = frappe.db.get_value(PROJECT_ROUTE, filters, ROUTE_FIELDS, as_dict=True)
	if not route:
		return None
	project_row = frappe.db.get_value("Project", route.project, ["name", "envision_enabled"], as_dict=True)
	repository_row = frappe.db.get_value(
		connection.REPOSITORY, route.repository, REPOSITORY_FIELDS, as_dict=True
	)
	reason = route_problem(project_row, repository_row)
	return {
		"name": route.name,
		"project": route.project,
		"repository": route.repository,
		"repository_row": repository_row,
		"routable": reason is None,
		"inactive_reason": reason,
		"sync_enabled": bool(route.sync_enabled),
		"paused": bool(route.paused),
		"activated_on": route.activated_on,
		"activated_at_utc": route.activated_at_utc,
	}


def sync_blocker(route: dict | None) -> str | None:
	"""Why Issues cannot move through this route now, or None when they can."""
	if not route:
		return "not_connected"
	if not route["sync_enabled"]:
		return "sync_not_enabled"
	if route["paused"]:
		return "sync_paused"
	return route["inactive_reason"]


def active_routes() -> list[dict]:
	"""Every route syncing now, for the scheduled scans."""
	routes = []
	for name in frappe.get_all(PROJECT_ROUTE, filters={"sync_enabled": 1, "paused": 0}, pluck="project"):
		route = route_for(project=name)
		if route and sync_blocker(route) is None:
			routes.append(route)
	return routes


def get_project_route(project: str) -> dict:
	"""What a Project reader may see: repository metadata and route state.

	No installation, app, or attribution details. ``can_manage`` tells a future
	UI whether to offer changes; the changes themselves re-check everything.
	"""
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	route = route_for(project=doc.name)
	result = {
		"project": doc.name,
		"can_manage": is_route_manager() and bool(frappe.has_permission("Project", "write", doc=doc)),
		"connected": bool(route),
		"repository": None,
		"routable": False,
		"inactive_reason": None,
		"sync_enabled": False,
	}
	if route:
		row = route["repository_row"]
		result.update(
			{
				"repository": safe_repository(route["repository"], row),
				"routable": route["routable"],
				"inactive_reason": route["inactive_reason"],
				"sync_enabled": route["sync_enabled"],
			}
		)
	return result


def safe_repository(repository_id: str, row: dict | None) -> dict:
	if not row:
		return {"id": repository_id}
	return {
		"id": row.name,
		"full_name": row.full_name,
		"html_url": row.html_url,
		"private": bool(row.private),
		"archived": bool(row.archived),
		"has_issues": bool(row.has_issues),
		"available": bool(row.available),
	}


def list_repository_candidates(project: str) -> list[dict]:
	"""Repositories this manager could connect the Project to: usable now and
	not routed to any Project. Routed repositories are left out entirely, so
	the list never reveals which other Project uses one."""
	doc = require_route_permission(project)
	if not doc:
		return []
	project_row = frappe._dict(name=doc.name, envision_enabled=doc.get("envision_enabled"))
	routed = set(frappe.get_all(PROJECT_ROUTE, pluck="repository"))
	rows = frappe.get_all(
		connection.REPOSITORY,
		filters={"available": 1, "archived": 0, "has_issues": 1},
		fields=REPOSITORY_FIELDS,
		order_by="full_name asc",
	)
	return [
		safe_repository(row.name, row)
		for row in rows
		if row.name not in routed and route_problem(project_row, row) is None
	]


def connect_repository(project: str, repository: str) -> dict:
	"""Route a Project to a repository. Runs its own transaction: commits on
	success and rolls back on failure, so call it only at a request boundary.
	Never replaces an existing route; clear it first."""
	require_route_permission(project)
	repository = str(repository or "")
	if not re.fullmatch(r"\d{1,30}", repository):
		frappe.throw(_("Choose a repository listed by the GitHub App."), frappe.ValidationError)
	with connection.connection_lock():
		try:
			frappe.get_doc({"doctype": PROJECT_ROUTE, "project": project, "repository": repository}).insert(
				ignore_permissions=True
			)
			frappe.db.commit()
		except frappe.UniqueValidationError:
			# Another writer won between the checks and the insert.
			frappe.db.rollback()
			frappe.clear_messages()
			frappe.throw(
				_("This project or repository was connected meanwhile. Refresh and try again."),
				frappe.DuplicateEntryError,
			)
		except Exception:
			frappe.db.rollback()
			raise
	return get_project_route(project)


def clear_repository(project: str) -> dict:
	"""Remove a Project's route. Same transaction contract as
	``connect_repository``.

	Its links are paused (``route_cleared``), never deleted: Tasks keep their
	Issue identity and queued work. Connecting the same repository and turning
	sync on again resumes them after a fresh comparison; a different
	repository leaves them paused (``destination_changed``), never rerouted."""
	require_route_permission(project)
	with connection.connection_lock():
		try:
			name = frappe.db.get_value(PROJECT_ROUTE, {"project": project}, "name", for_update=True)
			if name:
				store.pause_links({"project": project}, "route_cleared")
				frappe.delete_doc(PROJECT_ROUTE, name, ignore_permissions=True, delete_permanently=True)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			raise
	return get_project_route(project)


def guard_project_rename(doc, method=None, old=None, new=None, merge=False) -> None:
	"""Ordinary renames preserve the route; merges must not move one silently.

	Issue links count too: a merge would move them to another Project's
	repository without any review."""
	projects = [old or doc.name, new]
	if merge and (
		frappe.db.exists(PROJECT_ROUTE, {"project": ["in", projects]})
		or frappe.db.exists(store.ISSUE_SYNC, {"project": ["in", projects]})
	):
		frappe.throw(
			_("Disconnect the GitHub repository from both projects before merging them."),
			frappe.ValidationError,
		)


def delete_project_route(project: str) -> None:
	"""Project ``on_trash`` (setu.api.project.guard_project_delete). Runs in the
	Project delete's own transaction: no commit and no Redis lock. Locking the
	Project row serializes with a route insert, which locks it first, so the
	delete cannot pass Frappe's link check while a route is being added.

	A Project can only be deleted without Tasks, so its links are tombstones of
	deleted Tasks or unfinished imports; they go with it."""
	frappe.db.get_value("Project", project, "name", for_update=True)
	store.delete_project_links(project)
	frappe.db.delete(PROJECT_ROUTE, {"project": project})
