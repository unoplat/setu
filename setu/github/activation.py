"""Turning GitHub sync on and off for a Project, explicitly, and what follows it.

Never automatic (docs/adr/0008): an upgrade, a new route or a reconnection
leaves sync off. A route manager with write access to the Project turns it on
after seeing:

- the destination repository and whether it is public or private;
- that Issues in it, private ones included, become Tasks readable by everyone
  with Project/Task access in Envision (the privacy acknowledgement);
- that tagged Tasks' titles, descriptions and Subtasks are copied to GitHub,
  possibly publicly (the publication acknowledgement);
- that deleting a linked Task or Issue permanently deletes the other, with the
  whole tree under it (the deletion acknowledgement);
- the backlog: Tasks already tagged ``github``, Completed ones included, which
  publish with their Subtasks when sync turns on. The preview's token must still
  match, so a backlog that changed after the preview is never published unseen.

Then a job (``run_import``) re-reads the repository, starting from page 1 on every
turn-on, because sync being off stored nothing from GitHub:

1. Links to another repository go, with their Retry Job rows. Their Issues stay.
2. Every Issue, open or closed, labelled or not, takes one branch: skipped, merged
   field by field into its link's Task, re-linked by marker, or, if it is open, imported
   as a new Task. A closed Issue with no link is not imported. The ``github`` tag gates
   only Envision → GitHub.
3. Waiting pushes and creates are enqueued, and the backlog publishes.

The route row is the job's state. It looks again after every commit, so turning sync
off stops it within a page and turning sync on again restarts it, and whatever else
stopped it resumes from ``activation_import_page``.

Turning sync off is ``links.stop_sync``.
"""

import hashlib
from datetime import datetime
from functools import partial
from typing import TypedDict

import frappe
from frappe import _
from frappe.query_builder.functions import Count
from frappe.utils import add_to_date, cint, now_datetime
from rq.timeouts import JobTimeoutException

from setu.github import (
	bot,
	clock,
	connection,
	convert,
	delta,
	inbound,
	issues,
	link_state,
	links,
	outbound,
	projects,
	retry,
	store,
)
from setu.github.client import GitHubError
from setu.github.issues import IssueData

ISSUE_SAVEPOINT = "envision_github_activation_issue"
ACTIVATION_JOB_TIMEOUT = 1500
QUEUED = "Queued"
RUNNING = "Running"
DONE = "Done"
FAILED = "Failed"
# A Cancelled Task stays linked, but these would have been unlinked.
NOT_RELINKED = frozenset({"milestone", "template"})


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
	"""Links by ``sync_state``."""

	not_synced: int
	synced: int
	to_be_updated: int
	cron_sync: int
	to_be_deleted: int
	unlinked: int


class ProjectGitHub(TypedDict):
	project: str
	can_manage: bool
	connected: bool
	repository: dict | None
	routable: bool
	inactive_reason: str | None
	inactive_message: str | None
	sync_enabled: bool
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
	publish with them, with a token for the exact set. A link to another
	repository is not a link here: turning sync on deletes it (``remove_other_links``)."""
	route = projects.route_for(project=project)
	repository = route["repository"] if route else ""
	tagged = [
		row.name
		for row in frappe.get_all(
			"Task",
			filters={
				"project": project,
				"_user_tags": ["like", f"%{links.GITHUB_TAG}%"],
				"is_milestone": 0,
				"is_template": 0,
				"status": ["not in", ["Cancelled", "Template"]],
			},
			fields=["name", "_user_tags"],
			order_by="lft asc",
			limit_page_length=0,
		)
		if links.has_github_tag(row._user_tags)
	]
	linked = set(
		frappe.get_all(
			store.ISSUE_SYNC,
			filters={"task": ["in", tagged or [""]], "repository_id": repository},
			pluck="task",
		)
	)
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
			frappe.get_all(
				store.ISSUE_SYNC,
				filters={"task": ["in", list(publishing)], "repository_id": repository},
				pluck="task",
			)
		)
		publishing = {name: None for name in publishing if name not in already}
	seed = "\n".join([repository, *sorted(publishing)])
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
	acknowledge_deletion: bool,
	backlog_token: str,
) -> ProjectGitHub:
	"""Turn sync on. Runs its own transaction under the connection lock."""
	projects.require_route_permission(project)
	if not (cint(acknowledge_private_data) and cint(acknowledge_publication) and cint(acknowledge_deletion)):
		frappe.throw(_("Confirm all three warnings before turning on GitHub sync."))
	with connection.connection_lock():
		try:
			route = projects.route_for(project=project)
			if not route:
				frappe.throw(_("Connect a GitHub repository to this project first."))
			if route["sync_enabled"]:
				frappe.throw(_("GitHub sync is already on for this project."))
			if route["inactive_reason"]:
				frappe.throw(projects.inactive_message(route["inactive_reason"]))
			require_subscribed_events()
			token = backlog(project)[2]
			if token != backlog_token:
				frappe.throw(_("The tagged tasks changed since you reviewed them. Review again."))
			record_activation(route["name"])
			enqueue_import(project)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			raise
	return project_view(project)


def require_subscribed_events() -> None:
	"""Checked live on GitHub. Sub-issue changes arrive only as sub_issues webhooks."""
	try:
		events = issues.subscribed_events()
	except GitHubError as exc:
		frappe.throw(_(str(exc)))
	settings = frappe.get_single("Envision GitHub Settings")
	settings.subscribed_events = "\n".join(events)
	settings.save(ignore_permissions=True)
	if any(event not in events for event in connection.REQUIRED_EVENTS):
		frappe.throw(
			_(
				"The GitHub App does not receive Issue, Sub-issue and Issue comment events. Subscribe it to Issues, Sub issues and Issue comment on GitHub (App settings → Permissions & events), then try again."
			)
		)


def record_activation(route_name: str) -> None:
	"""Sync on, the three acknowledgements, and the job's state back at page 1."""
	user = frappe.session.user
	now = now_datetime()
	doc = frappe.get_doc(connection.PROJECT_ROUTE, route_name)
	doc.flags.envision_github_activation = True
	doc.update(
		{
			"sync_enabled": 1,
			"activated_on": now,
			"activated_by": user,
			"privacy_acknowledged_by": user,
			"privacy_acknowledged_on": now,
			"publication_acknowledged": 1,
			"deletion_acknowledged_by": user,
			"deletion_acknowledged_on": now,
			"activation_import_state": QUEUED,
			"activation_import_page": 1,
			"last_error": None,
		}
	)
	doc.save(ignore_permissions=True)


def disable(project: str) -> ProjectGitHub:
	"""Turn sync off. Runs its own transaction under the connection lock."""
	projects.require_route_permission(project)
	with connection.connection_lock():
		try:
			route = projects.route_for(project=project)
			if not route or not route["sync_enabled"]:
				frappe.throw(_("GitHub sync is not on for this project."))
			links.stop_sync(project, route["repository"])
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			raise
	return project_view(project)


def enqueue_import(project: str) -> None:
	"""Run the import once the state it reads is committed."""
	frappe.db.after_commit.add(partial(enqueue_import_committed, project))


def enqueue_import_committed(project: str) -> None:
	try:
		frappe.enqueue(
			"setu.github.activation.run_import",
			project=project,
			queue="long",
			timeout=ACTIVATION_JOB_TIMEOUT,
			job_id=f"envision-github-import-{project}",
			deduplicate=True,
		)
	except Exception:
		frappe.logger("envision.github").warning("GitHub import queue unavailable; recovery will retry.")


def run_import(project: str) -> None:
	"""The turn-on job. Each step can run again, so anything that stops it resumes: the
	5-minute scan enqueues a Queued or Failed import, or a Running one gone stale. A rate
	limit or running out of time isn't a failure: it goes back to Queued, at its page."""
	route = projects.route_for(project=project)
	if not route or projects.sync_blocker(route):
		return
	name = route["name"]
	if frappe.db.get_value(connection.PROJECT_ROUTE, name, "activation_import_state") == DONE:
		return
	set_progress(name, {"activation_import_state": RUNNING})
	# The recovery scan must see a running import even if this worker times out.
	frappe.db.commit()  # nosemgrep: frappe-manual-commit
	try:
		remove_other_links(route)
		frappe.db.commit()
		if import_pages(route):
			publish_waiting(route)
			set_progress(name, {"activation_import_state": DONE, "last_error": None})
			frappe.db.commit()
	except JobTimeoutException:
		stop_import(name, QUEUED, None)
	except Exception as exc:
		if outbound.is_rate_limited(exc):
			stop_import(name, QUEUED, store.error_text(exc))
		else:
			fail_import(name, exc)


def set_progress(route_name: str, values: dict[str, str | int | None]) -> None:
	"""The job's state, only while sync is on: turning it off cleared these. The update
	reads the row as committed, whatever this transaction's snapshot says."""
	frappe.db.set_value(connection.PROJECT_ROUTE, {"name": route_name, "sync_enabled": 1}, values)


def stop_import(route_name: str, state: str, error: str | None) -> None:
	frappe.db.rollback()
	write_stop(route_name, state, error)


def fail_import(route_name: str, exc: Exception) -> None:
	"""The Error Log is written after the rollback, so it stays."""
	frappe.db.rollback()
	retry.log_failure(exc, None)
	safe = isinstance(exc, GitHubError | frappe.ValidationError)
	generic = _("Envision could not finish reading this repository's Issues. The Error Log has the cause.")
	write_stop(route_name, FAILED, store.error_text(exc) if safe else generic)


def write_stop(route_name: str, state: str, error: str | None) -> None:
	# run_import catches the failure and returns; Frappe commits this final job state.
	set_progress(route_name, {"activation_import_state": state, "last_error": error})


# Step 1.


def remove_other_links(route: dict) -> None:
	"""Links in another repository, in any state, with their Retry Job rows. Their Issues
	stay on GitHub, and their pending edits and deletes are dropped."""
	for name in frappe.get_all(
		store.ISSUE_SYNC,
		filters={"project": route["project"], "repository_id": ["!=", route["repository"]]},
		pluck="name",
		order_by="name asc",
	):
		link = links.locked_link(name)
		if link:
			links.delete_link(link)


# Step 2.


def import_pages(route: dict) -> bool:
	"""Every page, oldest Issues first, so an Issue created meanwhile can't shift one past
	the checkpoint. Commits per page. False when sync went off. The checkpoint only moves
	from the page this run read, so turning sync on again meanwhile restarts from page 1."""
	row = route["repository_row"]
	while True:
		page = live_page(route)
		if page is None:
			return False
		result = issues.list_issues(
			row.installation,
			row.full_name,
			state="all",
			sort="created",
			direction="asc",
			page=page,
		)
		if not import_page(route, result["issues"]):
			# Save the retry row left after a page rollback before reading that page again.
			frappe.db.commit()  # nosemgrep: frappe-manual-commit
			continue
		frappe.db.set_value(
			connection.PROJECT_ROUTE,
			{"name": route["name"], "sync_enabled": 1, "activation_import_page": page},
			"activation_import_page",
			page + 1,
		)
		# Keep each page and its checkpoint atomic and durable across a later timeout.
		frappe.db.commit()  # nosemgrep: frappe-manual-commit
		if not result["more"] and live_page(route) == page + 1:
			return True


def live_page(route: dict) -> int | None:
	"""The page to read next, read after a commit, so it is current. None when sync has
	gone off, and what the job committed after that is cleaned up here."""
	values = frappe.db.get_value(
		connection.PROJECT_ROUTE,
		{"project": route["project"], "repository": route["repository"]},
		["sync_enabled", "activation_import_page"],
		as_dict=True,
	)
	if values and values.sync_enabled:
		return values.activation_import_page or 1
	# No more pages run; Frappe commits the cleanup when run_import returns.
	links.stop_sync(route["project"], route["repository"])
	return None


def import_page(route: dict, page: list[IssueData]) -> bool:
	"""False when a failure took the page's uncommitted work with it, so it runs again."""
	return all(import_issue(route, issue) for issue in page)


def import_issue(route: dict, issue: IssueData) -> bool:
	"""One Issue. While its Retry Job row exists or its lock is busy, it is someone else's
	work right now, so it goes in the row and the cron reads it again. A link of another
	Project is that Project's, and is left alone (``links.in_other_project``)."""
	if issue["is_pull_request"]:
		return True
	link = links.link_for_issue(issue["id"])
	if link and (link.project != route["project"] or not link_state.accepts_import(link.sync_state)):
		return True
	target = inbound.target_for(route["repository"], issue)
	job_key = delta.inbound_job_key(route["repository"], issue["id"])
	if retry.merge_into_row(job_key, {delta.ISSUE_RESOURCE: delta.SYNC}, None):
		return True
	lock = store.issue_lock_nowait(issue["id"])
	if not lock.acquire():
		queue_issue(target, link, None)
		return True
	try:
		return place_in_savepoint(route, issue, link)
	finally:
		lock.release()


def place_in_savepoint(route: dict, issue: IssueData, link: frappe._dict | None) -> bool:
	"""One Issue's failure is undone alone and retried from its Retry Job row, with an
	Error Log. A rate limit, an outage or the job's own timeout stops the job instead."""
	frappe.db.savepoint(ISSUE_SAVEPOINT)
	try:
		with bot.syncing():
			place_issue(route, issue, link)
	except JobTimeoutException:
		raise
	except Exception as exc:
		if inbound.is_infrastructure(exc) or outbound.is_rate_limited(exc):
			raise
		kept = undo_issue()
		error_log = retry.log_failure(exc, link.name if link else None)
		queue_issue(inbound.target_for(route["repository"], issue), link, error_log)
		return kept
	return True


def undo_issue() -> bool:
	"""Back to the Issue's savepoint. False when a deadlock has already rolled the whole
	transaction back, savepoint and the page so far included."""
	try:
		frappe.db.rollback(save_point=ISSUE_SAVEPOINT)
	except Exception:
		frappe.db.rollback()
		return False
	return True


def queue_issue(target: dict[str, str | int], link: frappe._dict | None, error_log: str | None) -> None:
	if link:
		links.locked_link(link.name)
	inbound.write_row(target, {delta.ISSUE_RESOURCE: delta.SYNC}, link.task if link else None, error_log)
	if link:
		links.settle(link.name)


def place_issue(route: dict, issue: IssueData, link: frappe._dict | None) -> None:
	"""The branches of G→E 2 part 4, for an Issue that isn't skipped."""
	if link:
		merge_linked(route, link, issue)
		return
	marker = convert.find_marker(issue["body"])
	if marker and outbound.created_by_app(issue, outbound.app_login()):
		relink(route, issue, marker)
		return
	# A closed Issue isn't imported (inbound.sync_issue). Closed ones are still read, so
	# their links merge and Envision's own Issues re-link above.
	name = inbound.import_issue(route, issue)
	if name:
		inbound.queue_imported_parent(route["repository"], name, issue)
		inbound.queue_imported_comments(route["repository"], name, issue)


def merge_linked(route: dict, link: frappe._dict, issue: IssueData) -> None:
	"""Linked: title, description and status merge now, and a parent GitHub changed has
	its own key, because the new parent may not have been read yet. Its comments are
	read again from the cron, for those written while sync was off."""
	run = inbound.KeyRun(inbound.target_for(route["repository"], issue))
	inbound.merge_fields(run, link, issue)
	inbound.note_update(run)
	if inbound.PARENT_RESOURCE not in inbound.pending_keys(link.name) and parent_moved(route, link, issue):
		inbound.queue_parent_key(route["repository"], issue, link.name)
	if link.sync_state not in link_state.MARKS:
		inbound.queue_imported_comments(route["repository"], link.name, issue)


def parent_moved(route: dict, link: frappe._dict, issue: IssueData) -> bool:
	"""Whether GitHub's parent isn't the Task's. A parent Task with no Issue here is no
	parent on GitHub (``outbound.parent_issue_number``). Silence says nothing, so a Task
	with a parent Issue gets the key, which asks GitHub (``inbound.stated_parent``)."""
	parent = frappe.db.get_value("Task", link.task, "parent_task")
	parent_link = links.link_for_task(parent) if parent else None
	current = None
	if links.publishing(parent_link) and parent_link.repository_id == route["repository"]:
		current = parent_link.issue_number or None
	if not issue["parent_known"]:
		return current is not None
	in_repository = (issue["parent_full_name"] or "").lower() == route["repository_row"].full_name.lower()
	return issue["parent_number"] != current or bool(issue["parent_number"] and not in_repository)


def relink(route: dict, issue: IssueData, marker: str) -> None:
	"""Envision's own Issue with no link: back to the marker's Task, unless that has gone,
	left this Project or has a link. Only its link can be missing the Issue's identity:
	a create whose response was lost, which this finishes as a webhook would."""
	if links.link_for_task(marker):
		links.fill_issue_identity(marker, route["repository"], inbound.issue_identity(issue))
		return
	task = frappe.db.get_value("Task", marker, links.TASK_FIELDS, as_dict=True)
	if not task or task.project != route["project"] or links.ineligible_reason(task) in NOT_RELINKED:
		return
	name = store.insert_unique(
		{
			"doctype": store.ISSUE_SYNC,
			"task": marker,
			"project": route["project"],
			"repository_id": route["repository"],
			"repository_full_name": route["repository_row"].full_name,
			"origin": "Envision",
			"sync_state": link_state.SYNCED,
			"last_synced_at": now_datetime(),
			**inbound.issue_identity(issue),
		}
	)
	if name:
		inbound.queue_imported_parent(route["repository"], name, issue)
		inbound.queue_imported_comments(route["repository"], name, issue)


# Step 3.


def publish_waiting(route: dict) -> None:
	"""The backlog publishes, and then every link with keys and no outbound row gets its
	job, which covers one whose enqueue failed just now."""
	for root in backlog(route["project"])[0]:
		links.guarded(links.tags_changed, root)
	try:
		frappe.db.commit()
	except Exception as exc:
		# Frappe runs the enqueues after the SQL commit, and they raise from here.
		frappe.db.rollback()
		store.log_safe(exc, "GitHub sync hook failed", "Project", route["project"])
	enqueue_waiting_links(route)


def enqueue_waiting_links(route: dict) -> None:
	"""Every link with keys and no outbound row gets its job."""
	for link in frappe.get_all(
		store.ISSUE_SYNC,
		filters={
			"project": route["project"],
			"repository_id": route["repository"],
			"delta": ["is", "set"],
		},
		fields=["name", "task"],
		order_by="name asc",
	):
		if not links.outbound_job(link.name):
			enqueue_waiting(link)


def enqueue_waiting(link: frappe._dict) -> None:
	"""A failure goes to cron_sync, as in create and update: no keys are left on a link
	with nothing queued."""
	try:
		links.enqueue_push(link.name, link.task or link.name)
		frappe.db.commit()
	except Exception as exc:
		frappe.db.rollback()
		outbound.move_to_retry_job(link.name, exc)


# Retrying by hand.


def retry_project(route: dict) -> None:
	"""Everything waiting in a Project that sync is on for: Retry Job rows come due, links
	holding keys get their job, and a failed import resumes from the page it stopped on."""
	retry.make_due(retry.project_rows(route["project"], route["repository"]))
	# An enqueue failure rolls back its own work, not the request to retry existing rows.
	frappe.db.commit()  # nosemgrep: frappe-manual-commit
	enqueue_waiting_links(route)
	state = frappe.db.get_value(connection.PROJECT_ROUTE, route["name"], "activation_import_state")
	if state == FAILED:
		set_progress(route["name"], {"activation_import_state": QUEUED})
		enqueue_import(route["project"])
	# The successful POST commits this state and runs the deferred import enqueue.


# What the Project Settings page shows.


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
		"not_synced": by_state.get(link_state.NOT_SYNCED, 0),
		"synced": by_state.get(link_state.SYNCED, 0),
		"to_be_updated": by_state.get(link_state.TO_BE_UPDATED, 0),
		"cron_sync": by_state.get(link_state.CRON_SYNC, 0),
		"to_be_deleted": by_state.get(link_state.TO_BE_DELETED, 0),
		"unlinked": by_state.get(link_state.UNLINKED, 0),
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
