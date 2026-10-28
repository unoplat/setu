"""Turning GitHub sync on for a Project, explicitly, and what follows it.

Never automatic (docs/adr/0008): an upgrade, a new route or a reconnection
leaves sync off. A route manager with write access to the Project turns it on
after seeing:

- the destination repository and whether it is public or private;
- that Issues in it, private ones included, become Tasks readable by everyone
  with Project/Task access in Envision (the privacy acknowledgement);
- that tagged Tasks' titles, descriptions and Subtasks are copied to GitHub,
  possibly publicly (the publication acknowledgement);
- the backlog: open Tasks already tagged ``github``, which publish with their
  Subtasks, Completed ones included, when sync turns on. A Completed tagged
  Task publishes once reopened. The preview's token must still match, so a
  backlog that changed after the preview is never published unseen.

Then every open Issue imports with its tree, labelled or not (``run_import``),
Issues created or reopened from now on import as they arrive, and Issues
Envision published earlier get its label. The ``github`` tag gates only
Envision → GitHub.
"""

import hashlib
from datetime import datetime
from functools import partial
from typing import TypedDict

import frappe
from frappe import _
from frappe.query_builder.functions import Count
from frappe.utils import add_to_date, cint, now_datetime

from setu.github import clock, connection, inbound, issues, links, projects, store
from setu.github.client import GitHubError


class RepositoryPreview(TypedDict):
	id: str
	full_name: str | None
	html_url: str | None
	private: bool | None


class BacklogTask(TypedDict):
	name: str
	subject: str
	parent_task: str | None
	# Subtasks that would publish with it.
	subtasks: int


class SyncPreview(TypedDict):
	project: str
	repository: RepositoryPreview
	backlog: list[BacklogTask]
	# Every Task that would publish: the tagged Tasks and their Subtasks.
	backlog_count: int
	backlog_token: str
	missing_events: list[str]


class SyncCounts(TypedDict):
	linked: int
	pending: int
	conflict: int
	error: int
	paused: int


class ProjectGitHub(TypedDict):
	project: str
	can_manage: bool
	connected: bool
	repository: dict | None
	routable: bool
	inactive_reason: str | None
	inactive_message: str | None
	sync_enabled: bool
	paused: bool
	blocker: str | None
	blocker_message: str | None
	activated_on: str | None
	activated_by: str | None
	activation_import_state: str | None
	last_error: str | None
	missing_events: list[str]
	counts: SyncCounts


def backlog(project: str) -> tuple[list[str], list[str], str]:
	"""The open tagged, unlinked Tasks (roots) and every Task that would
	publish with them, with a token for the exact set."""
	tagged = [
		row.name
		for row in frappe.get_all(
			"Task",
			filters={
				"project": project,
				"_user_tags": ["like", f"%{links.GITHUB_TAG}%"],
				"is_milestone": 0,
				"is_template": 0,
				"status": ["not in", ["Cancelled", "Template", "Completed"]],
			},
			fields=["name", "_user_tags"],
			order_by="lft asc",
			limit_page_length=0,
		)
		if links.has_github_tag(row._user_tags)
	]
	linked = set(frappe.get_all(store.ISSUE_SYNC, filters={"task": ["in", tagged or [""]]}, pluck="task"))
	roots: list[str] = []
	publishing: dict[str, None] = {}
	for name in tagged:
		if name in linked or name in publishing:
			continue
		roots.append(name)
		for row in links.subtree_rows(name):
			if not links.ineligible_reason(row) and row.project == project:
				publishing[row.name] = None
	if publishing:
		already = set(
			frappe.get_all(store.ISSUE_SYNC, filters={"task": ["in", list(publishing)]}, pluck="task")
		)
		publishing = {name: None for name in publishing if name not in already}
	route = projects.route_for(project=project)
	seed = "\n".join([route["repository"] if route else "", *sorted(publishing)])
	return roots, list(publishing), hashlib.sha256(seed.encode()).hexdigest()


def preview(project: str) -> SyncPreview:
	"""What turning sync on would do. Reads only; calls GitHub not at all."""
	projects.require_route_permission(project)
	route = projects.route_for(project=project)
	if not route:
		frappe.throw(_("Connect a GitHub repository to this project first."))
	roots, publishing, token = backlog(project)
	subjects = dict(
		frappe.get_all(
			"Task", filters={"name": ["in", roots or [""]]}, fields=["name", "subject"], as_list=True
		)
	)
	parents = dict(
		frappe.get_all(
			"Task", filters={"name": ["in", roots or [""]]}, fields=["name", "parent_task"], as_list=True
		)
	)
	in_trees = set(publishing)
	row = route["repository_row"]
	return {
		"project": project,
		"repository": {
			"id": route["repository"],
			"full_name": row.full_name if row else None,
			"html_url": row.html_url if row else None,
			"private": bool(row.private) if row else None,
		},
		"backlog": [
			{
				"name": name,
				"subject": subjects.get(name) or name,
				"parent_task": parents.get(name) or None,
				"subtasks": sum(
					1 for descendant in links.subtree_rows(name)[1:] if descendant.name in in_trees
				),
			}
			for name in roots
		],
		"backlog_count": len(publishing),
		"backlog_token": token,
		"missing_events": connection.missing_events(),
	}


def enable(
	project: str,
	acknowledge_private_data: bool,
	acknowledge_publication: bool,
	backlog_token: str,
) -> ProjectGitHub:
	"""Turn sync on. Runs its own transaction under the connection lock."""
	projects.require_route_permission(project)
	if not (cint(acknowledge_private_data) and cint(acknowledge_publication)):
		frappe.throw(_("Confirm both warnings before turning on GitHub sync."))
	with connection.connection_lock():
		try:
			route = projects.route_for(project=project)
			if not route:
				frappe.throw(_("Connect a GitHub repository to this project first."))
			if route["sync_enabled"]:
				frappe.throw(_("GitHub sync is already on for this project."))
			if route["inactive_reason"]:
				frappe.throw(projects.inactive_message(route["inactive_reason"]))
			try:
				events = issues.subscribed_events()
			except GitHubError as exc:
				frappe.throw(_(str(exc)))
			settings = frappe.get_single("Envision GitHub Settings")
			settings.subscribed_events = "\n".join(events)
			settings.save(ignore_permissions=True)
			# Sub-issue changes arrive only as sub_issues webhooks.
			if any(event not in events for event in connection.REQUIRED_EVENTS):
				frappe.throw(
					_(
						"The GitHub App does not receive Issue and Sub-issue events. Subscribe it to Issues and Sub issues on GitHub (App settings → Permissions & events), then try again."
					)
				)
			roots, _publishing, token = backlog(project)
			if token != backlog_token:
				frappe.throw(_("The tagged tasks changed since you reviewed them. Review again."))
			now = clock.utc_now()
			doc = frappe.get_doc(connection.PROJECT_ROUTE, route["name"])
			doc.flags.envision_github_activation = True
			doc.update(
				{
					"sync_enabled": 1,
					"paused": 0,
					"activated_on": now_datetime(),
					"activated_by": frappe.session.user,
					"activated_at_utc": clock.iso(now),
					"privacy_acknowledged_by": frappe.session.user,
					"privacy_acknowledged_on": now_datetime(),
					"publication_acknowledged": 1,
					"activation_import_state": "Queued",
					"activation_import_page": 1,
					"last_error": None,
				}
			)
			doc.save(ignore_permissions=True)
			route = projects.route_for(project=project)
			for root in roots:
				links.prepare_subtree(root, route)
			resume_route_links(route)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			raise
	enqueue_import(project)
	return project_view(project)


def resume_route_links(route: dict) -> None:
	"""Links paused by losing this route resume after a fresh comparison;
	links made for another repository stay paused, never rerouted."""
	for link in frappe.get_all(
		store.ISSUE_SYNC,
		filters={
			"project": route["project"],
			"sync_state": "Paused",
			"paused_reason": ["in", list(store.ROUTE_PAUSES)],
		},
		fields=["name", "repository_id", "issue_id", "task"],
	):
		if link.repository_id != route["repository"]:
			frappe.db.set_value(store.ISSUE_SYNC, link.name, "paused_reason", "destination_changed")
			continue
		frappe.db.set_value(
			store.ISSUE_SYNC,
			link.name,
			{"sync_state": "Synced" if link.issue_id and link.task else "Pending", "paused_reason": None},
		)
		store.requeue_waiting([link.name])
		if not link.task:
			store.queue_op(link.name, "import_issue", route["project"])
		else:
			store.queue_op(link.name, "reconcile" if link.issue_id else "create_issue", route["project"])


def set_paused(project: str, paused: bool) -> ProjectGitHub:
	"""Pause or resume a Project's sync. Same transaction contract as enable."""
	projects.require_route_permission(project)
	with connection.connection_lock():
		try:
			route = projects.route_for(project=project)
			if not route or not route["sync_enabled"]:
				frappe.throw(_("GitHub sync is not on for this project."))
			doc = frappe.get_doc(connection.PROJECT_ROUTE, route["name"])
			doc.paused = 1 if paused else 0
			doc.save(ignore_permissions=True)
			if not paused:
				route = projects.route_for(project=project)
				resume_route_links(route)
				names = frappe.get_all(store.ISSUE_SYNC, filters={"project": project}, pluck="name")
				store.requeue_waiting(
					frappe.get_all(
						store.OPERATION,
						filters={"link": ["in", names or [""]], "status": "Waiting"},
						pluck="link",
						distinct=True,
					)
				)
				requeue_deferred(route["repository"])
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			raise
	if not paused:
		enqueue_import(project)
	return project_view(project)


def requeue_deferred(repository: str) -> None:
	"""Webhooks that arrived while the Project was paused or not routable."""
	for name in frappe.get_all(
		connection.DELIVERY,
		filters={"repository_id": repository, "status": "Deferred"},
		pluck="name",
		limit_page_length=500,
	):
		frappe.db.set_value(connection.DELIVERY, name, {"status": "Queued", "attempts": 0, "error": None})
		frappe.db.after_commit.add(partial(enqueue_delivery, name))


def enqueue_delivery(name: str) -> None:
	try:
		frappe.enqueue(
			"setu.github.inbound.process_issue_delivery",
			delivery_id=name,
			queue="long",
			timeout=600,
			job_id=f"envision-github-{name}",
			deduplicate=True,
		)
	except Exception:
		frappe.logger("envision.github").warning("GitHub delivery queue unavailable; recovery will retry.")


def enqueue_import(project: str) -> None:
	"""Run the import once the state it reads is committed."""
	frappe.db.after_commit.add(partial(enqueue_import_committed, project))


def enqueue_import_committed(project: str) -> None:
	try:
		frappe.enqueue(
			"setu.github.activation.run_import",
			project=project,
			queue="long",
			timeout=1500,
			job_id=f"envision-github-import-{project}",
			deduplicate=True,
		)
	except Exception:
		frappe.logger("envision.github").warning("GitHub import queue unavailable; recovery will retry.")


def run_import(project: str) -> None:
	"""Record every open Issue in the repository for import, a page at a
	time, so an interruption resumes where it stopped; each one's closed
	sub-issues follow its import (inbound.observe_sub_issues). Pull requests
	are skipped. Issues created meanwhile arrive by webhook too; the unique
	Issue id on the link imports each once (docs/adr/0008). Then the Issues
	Envision published get its label. Once Done it never runs again."""
	route = projects.route_for(project=project)
	if not route or projects.sync_blocker(route):
		return
	name = route["name"]
	state, page = frappe.db.get_value(
		connection.PROJECT_ROUTE, name, ["activation_import_state", "activation_import_page"]
	)
	if state == "Done":
		return
	frappe.db.set_value(connection.PROJECT_ROUTE, name, "activation_import_state", "Running")
	frappe.db.commit()
	row = route["repository_row"]
	page = page or 1
	try:
		while True:
			result = issues.list_issues(
				row.installation,
				row.full_name,
				state="open",
				sort="created",
				direction="asc",
				page=page,
			)
			for issue in result["issues"]:
				inbound.consider_import(route, issue)
			page += 1
			frappe.db.set_value(connection.PROJECT_ROUTE, name, "activation_import_page", page)
			frappe.db.commit()
			if not result["more"]:
				break
		label_published(route)
		frappe.db.set_value(
			connection.PROJECT_ROUTE, name, {"activation_import_state": "Done", "last_error": None}
		)
		frappe.db.commit()
	except GitHubError as exc:
		frappe.db.rollback()
		frappe.db.set_value(
			connection.PROJECT_ROUTE, name, {"activation_import_state": "Failed", "last_error": str(exc)}
		)
		frappe.db.commit()


def label_published(route: dict) -> None:
	"""Add the Envision label to the Issues Envision already published to
	the repository. Adding it twice changes nothing, so an interrupted import
	runs this again; an Issue GitHub no longer has is skipped."""
	row = route["repository_row"]
	numbers = frappe.get_all(
		store.ISSUE_SYNC,
		filters={
			"project": route["project"],
			"repository_id": route["repository"],
			"origin": "Envision",
			"issue_number": ["is", "set"],
			"sync_state": ["in", list(store.ACTIVE_STATES)],
		},
		pluck="issue_number",
	)
	if not numbers:
		return
	issues.ensure_label(row.installation, row.full_name)
	for number in numbers:
		try:
			issues.add_label(row.installation, row.full_name, number)
		except GitHubError as exc:
			if exc.status not in inbound.GONE:
				raise


def counts(project: str) -> SyncCounts:
	table = frappe.qb.DocType(store.ISSUE_SYNC)
	rows = (
		frappe.qb.from_(table)
		.select(table.sync_state, Count(table.name))
		.where(table.project == project)
		.groupby(table.sync_state)
	).run()
	by_state = {state: int(total) for state, total in rows}
	return {
		"linked": sum(by_state.get(state, 0) for state in store.ACTIVE_STATES),
		"pending": by_state.get("Pending", 0),
		"conflict": by_state.get("Conflict", 0),
		"error": by_state.get("Error", 0),
		"paused": by_state.get("Paused", 0),
	}


def project_view(project: str) -> ProjectGitHub:
	"""What a Project reader sees; managers also see errors and missing events."""
	base = projects.get_project_route(project)
	route = projects.route_for(project=project)
	blocker = projects.sync_blocker(route)
	details = (
		frappe.db.get_value(
			connection.PROJECT_ROUTE,
			route["name"],
			["activated_by", "activation_import_state", "last_error"],
			as_dict=True,
		)
		if route
		else None
	)
	can_manage = bool(base["can_manage"])
	reason = base["inactive_reason"]
	return {
		"project": base["project"],
		"can_manage": can_manage,
		"connected": base["connected"],
		"repository": base["repository"],
		"routable": base["routable"],
		"inactive_reason": reason,
		"inactive_message": projects.inactive_message(reason) if reason else None,
		"sync_enabled": base["sync_enabled"],
		"paused": bool(route and route["paused"]),
		"blocker": blocker,
		"blocker_message": projects.inactive_message(blocker) if blocker else None,
		"activated_on": clock.site_iso(route["activated_on"]) if route else None,
		"activated_by": details.activated_by if details else None,
		"activation_import_state": (details.activation_import_state or None) if details else None,
		"last_error": details.last_error if details and can_manage else None,
		"missing_events": connection.missing_events() if can_manage else [],
		"counts": counts(project),
	}


def stale_import_cutoff() -> datetime:
	return add_to_date(now_datetime(), minutes=-30)
