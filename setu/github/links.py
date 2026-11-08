"""Which Tasks link to GitHub Issues, and the Task and tag events that publish them.

Publishing (docs/adr/0008):

- The ``github`` tag publishes a Task, whether it is added at creation or
  later. Tags are added after a Task is inserted (setu.api.task) and through
  Frappe's tag API in Desk and REST, which inserts a Tag Link; so the triggers
  are ``on_tag_link_insert``, the explicit ``tags_changed`` call in the Task
  API, and setu.github.recovery's scan for tagged Tasks without a link.
- A published Task's whole Subtask tree publishes with it, Completed
  Subtasks included, and Subtasks added or moved under a published Task later
  publish too. A tagged Subtask whose parent is not published publishes as a
  standalone Issue.
- Nothing publishes until a manager has turned sync on for the Project.
  Tasks tagged before that are the backlog that activation previews and
  publishes when sync turns on.
- A Task links to at most one Issue, ever: a link that exists in any state,
  ``unlinked`` included, is never replaced, so removing and re-adding the tag
  never creates a second Issue.

Publishing inserts the link in the user's own transaction, as the durable
record of the work, and after commit a job runs setu.github.outbound.push_task_delta.

An edit to a linked Task records the keys it changed in that same transaction:
in its github:task Retry Job row if it has one, otherwise in link.delta, and
the job follows if Project sync is on. Moving the Task to another Project, or
making it a milestone or template, unlinks it instead.

Deleting a linked Task deletes its Issue: the Task goes at once, and its link stays
as ``to_be_deleted``, holding ``issue: delete``, until the Issue has gone too.

Hooks run inside the user's own save. Each runs in a savepoint and logs
instead of failing the save; the recovery scan publishes a tagged Task that was
missed, and a Subtask missed that way waits until it is tagged or moved. The
exception is ``on_task_trash``: it decides what the delete means, so a failure
there rolls the delete back.
This module does not import setu.api, which imports it.
"""

from collections.abc import Callable
from typing import TypedDict

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime
from frappe.utils.background_jobs import get_job_status
from frappe.utils.nestedset import get_descendants_of
from rq.job import JobStatus

from setu.github import bot, clock, convert, delta, issues, link_state, projects, retry, store, titles
from setu.retry_jobs import RUNNING

GITHUB_TAG = "github"
TASK_FIELDS = ["name", "project", "status", "is_milestone", "is_template", "parent_task", "_user_tags"]
LINK_FIELDS = [
	"name",
	"task",
	"project",
	"repository_id",
	"repository_full_name",
	"origin",
	"sync_state",
	"delta",
	"repository_provider_issue_id",
	"issue_node_id",
	"issue_number",
	"issue_url",
	"create_requested_at",
	"last_synced_at",
]
# What settling a link's sync_state reads (setu.github.link_state).
STATE_FIELDS = [
	"name",
	"task",
	"sync_state",
	"delta",
	"repository_id",
	"repository_provider_issue_id",
	"modified",
]
# What a Task page shows of a Retry Job row.
RETRY_VIEW_FIELDS = ["job_key", "status", "attempts", "next_retry_at", "error_log"]
# As long as store.link_lock: the job holds that lock for its whole run.
PUSH_JOB_TIMEOUT = 900


class RepositoryView(TypedDict):
	id: str
	full_name: str | None
	html_url: str | None
	private: bool | None


class RouteView(TypedDict):
	connected: bool
	sync_enabled: bool
	blocker: str | None
	blocker_message: str | None
	repository: RepositoryView | None


class RetryView(TypedDict):
	"""One of the link's Retry Job rows. A row that isn't a failure (a busy lock, say)
	has no ``error``."""

	direction: delta.Direction
	running: bool
	attempts: int
	next_retry_at: str | None
	error: str | None


class LinkView(TypedDict):
	state: link_state.LinkState
	message: str | None
	issue_number: int | None
	issue_url: str | None
	repository_full_name: str | None
	origin: str | None
	last_synced_at: str | None
	# Work that runs without anyone acting: none while the route is stopped.
	pending: bool
	# A create was sent and its outcome is still being checked.
	uncertain: bool
	retries: list[RetryView]


class TaskActions(TypedDict):
	retry: bool


class TaskGitHub(TypedDict):
	task: str
	tagged: bool
	eligible: bool
	ineligible_reason: str | None
	# For a tagged Task without a link: why it has not published.
	waiting_reason: str | None
	waiting_message: str | None
	route: RouteView
	link: LinkView | None
	can_write: bool
	actions: TaskActions


def has_github_tag(user_tags: str | None) -> bool:
	return GITHUB_TAG in {tag.strip().casefold() for tag in (user_tags or "").split(",")}


def ineligible_reason(task: Document | frappe._dict) -> str | None:
	"""Only ordinary Tasks in a Project publish or import."""
	if task.get("is_milestone"):
		return "milestone"
	if task.get("is_template") or task.get("status") == "Template":
		return "template"
	if task.get("status") == "Cancelled":
		return "cancelled"
	if not task.get("project"):
		return "no_project"
	return None


def link_for_task(task: str) -> frappe._dict | None:
	return frappe.db.get_value(store.ISSUE_SYNC, {"task": task}, LINK_FIELDS, as_dict=True)


def link_for_issue(issue_id: str) -> frappe._dict | None:
	return frappe.db.get_value(
		store.ISSUE_SYNC, {"repository_provider_issue_id": issue_id}, LINK_FIELDS, as_dict=True
	)


def in_other_project(link: frappe._dict | None, repository_id: str) -> bool:
	"""Whether a link belongs to a Project other than the one its repository routes to
	now: Project Q disconnected the repository and P connected it. A link's Project is
	fixed, so P's webhooks and imports must not write into Q's Tasks."""
	if not link:
		return False
	route = projects.route_for(repository=repository_id)
	return bool(route and link.project != route["project"])


def publishing(link: frappe._dict | None) -> bool:
	"""Whether a parent's link carries its new Subtasks along."""
	return bool(link and link.sync_state not in link_state.MARKS)


# Publishing.


def tags_changed(task_name: str) -> None:
	"""Publish a Task that now has the ``github`` tag, with its Subtask tree.

	Idempotent: called from the Task API, the Tag Link hook and recovery.
	"""
	row = frappe.db.get_value("Task", task_name, TASK_FIELDS, as_dict=True)
	if not row or not has_github_tag(row._user_tags) or ineligible_reason(row):
		return
	if frappe.db.exists(store.ISSUE_SYNC, {"task": task_name}):
		return
	route = projects.route_for(project=row.project)
	# Before sync is on, a tagged Task is backlog: activation previews it.
	if not route or not route["sync_enabled"]:
		return
	prepare_subtree(task_name, route)


def publish_under_parent(task_name: str, parent: str, project: str) -> None:
	"""A Subtask added or moved under a published Task publishes too."""
	parent_link = link_for_task(parent)
	if not publishing(parent_link) or parent_link.project != project:
		return
	route = projects.route_for(project=project)
	if not route or not route["sync_enabled"] or route["repository"] != parent_link.repository_id:
		return
	prepare_subtree(task_name, route)


def subtree_rows(task_name: str) -> list[frappe._dict]:
	"""The Task and every descendant, parents before children."""
	descendants = get_descendants_of("Task", task_name, ignore_permissions=True)
	return frappe.get_all(
		"Task",
		filters={"name": ["in", [task_name, *descendants]]},
		fields=TASK_FIELDS,
		order_by="lft asc",
	)


def prepare_subtree(task_name: str, route: dict) -> list[str]:
	"""Link every eligible, unlinked Task in the tree. Returns their names."""
	if not route["sync_enabled"]:
		return []
	rows = subtree_rows(task_name)
	linked = set(
		frappe.get_all(store.ISSUE_SYNC, filters={"task": ["in", [row.name for row in rows]]}, pluck="task")
	)
	prepared = []
	for row in rows:
		if row.name in linked or ineligible_reason(row) or row.project != route["project"]:
			continue
		if prepare_publication(row, route):
			prepared.append(row.name)
	return prepared


def publish_delta(task: frappe._dict) -> dict[str, str]:
	"""A new link's delta: create the Issue, then nest it and close it as the Task
	needs. ``issue: create`` runs first, so these keys have an Issue to act on."""
	entries = {delta.ISSUE_RESOURCE: delta.CREATE}
	if task.parent_task:
		entries["parent"] = delta.PUSH
	if issues.state_patch(task.status).get("state") != "open":
		entries["status"] = delta.PUSH
	return entries


def prepare_publication(task: frappe._dict, route: dict) -> str | None:
	"""Record that a Task publishes to the route's repository, then push it after commit.

	The destination is fixed here: a later route change never reroutes it.
	``task`` is a row with ``TASK_FIELDS``. Returns None if a link exists.
	"""
	repository_row = route["repository_row"] or {}
	name = store.insert_unique(
		{
			"doctype": store.ISSUE_SYNC,
			"task": task.name,
			"project": route["project"],
			"repository_id": route["repository"],
			"repository_full_name": repository_row.get("full_name"),
			"origin": "Envision",
			"sync_state": link_state.NOT_SYNCED,
			"delta": delta.dump_delta(publish_delta(task)),
		}
	)
	if name:
		enqueue_push(name, task.name)
		nest_published_children(task.name, route["repository"])
	return name


def nest_published_children(task_name: str, repository: str) -> None:
	"""A Subtask published before its parent has a link, so publishing can't nest it:
	it records ``parent: push``. The key fails and retries until the parent's Issue
	exists. Child links lock in name order; the new link is not visible to anyone
	else yet, and the Tasks are only read.
	"""
	children = frappe.get_all("Task", filters={"parent_task": task_name}, pluck="name")
	if not children:
		return
	rows = frappe.get_all(
		store.ISSUE_SYNC,
		filters={
			"task": ["in", children],
			"repository_id": repository,
			"sync_state": ["not in", list(link_state.MARKS)],
		},
		fields=["name", "task", "project"],
		order_by="name asc",
	)
	for row in rows:
		record_keys(row.name, row.task, row.project, ["parent"])


def enqueue_push(link_name: str, task_name: str, *, rerun: bool = False) -> None:
	"""Run the link's push job after this transaction commits.

	One queued job per Task: it reads link.delta under the row lock when it starts,
	so it sees these keys. A running job may be past its last read, and deduplicating
	on its id would silently drop this one, so that takes a rerun id. ``rerun`` is for
	the job itself, whose own id is always running.
	"""
	job_id = delta.outbound_job_key(task_name)
	rerun = rerun or get_job_status(job_id) == JobStatus.STARTED
	frappe.enqueue(
		delta.HANDLERS["outbound"],
		timeout=PUSH_JOB_TIMEOUT,
		job_id=f"{job_id}:rerun:{frappe.generate_hash(length=8)}" if rerun else job_id,
		deduplicate=not rerun,
		enqueue_after_commit=True,
		target={"link": link_name},
	)


# Document hooks (setu/hooks.py).


def guarded(function: Callable[..., object], *args: str | Document) -> None:
	"""Run sync bookkeeping without ever failing the user's save."""
	frappe.db.savepoint("envision_github_hook")
	try:
		function(*args)
	except Exception as exc:
		frappe.db.rollback(save_point="envision_github_hook")
		store.log_safe(exc, "GitHub sync hook failed", "Task", None)


def on_task_insert(doc: Document, method: str | None = None) -> None:
	if bot.inbound() or not doc.parent_task or ineligible_reason(doc):
		return
	guarded(publish_under_parent, doc.name, doc.parent_task, doc.project)


def on_task_update(doc: Document, method: str | None = None) -> None:
	# Inserts are handled by on_task_insert; a change from GitHub is not pushed back.
	if bot.inbound() or doc.flags.in_insert or doc.get_doc_before_save() is None:
		return
	guarded(task_updated, doc)


def task_updated(doc: Document) -> None:
	link = link_for_task(doc.name)
	if not link:
		if doc.parent_task and doc.has_value_changed("parent_task") and not ineligible_reason(doc):
			publish_under_parent(doc.name, doc.parent_task, doc.project)
		return
	if not link_state.accepts_envision_edit(link.sync_state):
		return
	if moved_or_converted(doc, link):
		unlink_task(link.name, doc)
		return
	keys = changed_keys(doc)
	if keys:
		record_keys(link.name, doc.name, link.project, keys)


def moved_or_converted(doc: Document, link: frappe._dict) -> bool:
	"""Moved to another Project, or made a milestone or template. Cancelled is not
	here: it closes the Issue and stays linked."""
	return doc.project != link.project or ineligible_reason(doc) in ("milestone", "template")


def unlink_task(link_name: str, doc: Document) -> None:
	"""UNLINK, in the user's transaction: the row, the Task and the Issue are all
	kept, and later events for the Issue are ignored."""
	link = locked_link(link_name)
	if not link or link_state.on_task_moved(link.sync_state) != link_state.Outcome.MARK_UNLINKED:
		return
	delete_retry_jobs(link)
	frappe.db.set_value(store.ISSUE_SYNC, link_name, {"sync_state": link_state.UNLINKED, "delta": None})
	guarded(remove_github_tag, doc)


def remove_github_tag(doc: Document) -> None:
	"""Remove the tag through Frappe's tag API, which deletes its Tag Link and inserts
	none for it, so ``on_tag_link_insert`` can't run; ``tags_changed`` would stop at
	the link anyway. A later save of this object would write its old ``_user_tags``
	back, so they are refreshed too."""
	doc.remove_tag(GITHUB_TAG)
	doc._user_tags = frappe.db.get_value("Task", doc.name, "_user_tags")


def strip_github_tag(task_name: str) -> None:
	"""Remove the tag with no user who can write the Task: Frappe's tag API checks write
	permission (``update_tags``), and a webhook runs as Guest and the integration user
	has no roles. These are the two writes it makes, and neither runs a Task hook."""
	current = frappe.db.get_value("Task", task_name, "_user_tags") or ""
	kept = [tag for tag in current.split(",") if tag and tag.strip().casefold() != GITHUB_TAG]
	frappe.db.set_value("Task", task_name, "_user_tags", ",".join(kept), update_modified=False)
	row = {"document_type": "Task", "document_name": task_name}
	for tag in frappe.get_all("Tag Link", filters=row, pluck="tag"):
		if tag.strip().casefold() == GITHUB_TAG:
			frappe.db.delete("Tag Link", {**row, "tag": tag})


def task_title(doc: Document) -> str:
	return titles.title(doc.subject, doc.description, False)


def description_digest(doc: Document) -> str:
	"""The description without the title's note, which belongs to the title."""
	return convert.html_digest(titles.content(doc.description, False))


def changed_keys(doc: Document) -> list[str]:
	"""The delta keys this save changed. Only a status move between Completed,
	Cancelled and open changes the Issue, so only that is a status key."""
	before = doc.get_doc_before_save()
	keys: list[str] = []
	if not titles.same(task_title(doc), task_title(before)):
		keys.append("title")
	if description_digest(doc) != description_digest(before):
		keys.append("description")
	if issues.state_patch(doc.status) != issues.state_patch(before.status):
		keys.append("status")
	if (doc.parent_task or None) != (before.parent_task or None):
		keys.append("parent")
	return keys


def record_keys(link_name: str, task_name: str, project: str, keys: list[str]) -> None:
	"""Record changed Task fields: each one's key is ``push``."""
	record_entries(link_name, task_name, project, dict.fromkeys(keys, delta.PUSH))


def record_entries(link_name: str, task_name: str, project: str, entries: dict[str, str]) -> None:
	"""Record outbound work in the user's transaction, under the link's row lock.

	A github:task row owns the link's sync: the keys merge into it and the cron runs
	them. Otherwise they merge into link.delta, and that write bumps ``modified``,
	which is how a job already running sees it (setu.github.outbound.run_job). A
	failed enqueue keeps the keys. Sync off: the keys wait.
	"""
	link = locked_link(link_name)
	if not link or not link_state.accepts_envision_edit(link.sync_state):
		return
	if outbound_job(link_name):
		retry.upsert_task_job(link_name, job_task_name(link), entries)
		return
	merged = delta.merge_delta(delta.parse_delta(link.delta) or {}, entries)
	frappe.db.set_value(store.ISSUE_SYNC, link_name, "delta", delta.dump_delta(merged))
	settle(link_name)
	route = projects.route_for(project=project)
	if route and route["sync_enabled"]:
		guarded(enqueue_push, link_name, task_name)


def on_task_trash(doc: Document, method: str | None = None) -> None:
	"""Decide what deleting a Task means, in the user's transaction (docs/adr/0008).

	Not guarded: any failure here rolls the delete back, so a Task never goes while
	its Issue's delete goes unrecorded. Frappe runs this before its link check, and
	nothing is left naming the Task when that check runs.

	A delete from GitHub comes here too, whatever in_github_sync says, because a
	Subtask's Issue still has to go. The Task whose Issue GitHub deleted finds no link:
	``inbound.apply_issue_deleted`` removes that first, so it gets no GitHub call.
	"""
	link = link_for_task(doc.name)
	if link:
		task_deleted(link.name, link.project)


def task_deleted(link_name: str, project: str) -> None:
	link = locked_link(link_name)
	if not link:
		return
	outcome = link_state.on_task_deleted(link.sync_state, has_issue=bool(link.repository_provider_issue_id))
	if outcome == link_state.Outcome.DELETE_ROW:
		# Even if create_requested_at is set: a create that did reach GitHub stays
		# there, and the job records nothing once the row has gone.
		delete_link(link)
	elif outcome == link_state.Outcome.MARK_TO_BE_DELETED:
		mark_to_be_deleted(link, project)
	elif outcome == link_state.Outcome.CLEAR_TASK:
		frappe.db.set_value(store.ISSUE_SYNC, link_name, "task", None)
		clear_job_references(link)


def mark_to_be_deleted(link: frappe._dict, project: str) -> None:
	"""Delete both sides: ``issue: delete`` replaces every key, in the link's outbound
	row if it has one, where the cron runs it, and otherwise in link.delta, with a job
	if Project sync is on. With sync off it waits for turn-on.

	This write bumps ``modified``, so a job already running sees it (outbound.run_job).
	"""
	entries = {delta.ISSUE_RESOURCE: delta.DELETE}
	issue_gone = inbound_row_holds_delete(link)
	has_row = bool(outbound_job(link.name))
	if has_row:
		retry.upsert_task_job(link.name, job_task_name(link), entries)
	in_a_row = has_row or issue_gone
	frappe.db.set_value(
		store.ISSUE_SYNC,
		link.name,
		{
			"task": None,
			"sync_state": link_state.TO_BE_DELETED,
			"delta": None if in_a_row else delta.dump_delta(entries),
		},
	)
	clear_job_references(link)
	if in_a_row:
		return
	route = projects.route_for(project=project)
	if route and route["sync_enabled"]:
		# The Task's name is gone, so the job is keyed on the link's.
		enqueue_push(link.name, link.name)


def inbound_row_holds_delete(link: frappe._dict) -> bool:
	"""Whether a github:issue row already says GitHub deleted the Issue: it stays, and
	the cron finishes the link with no GitHub call. Any other inbound row goes. Its
	keys are for a Task that is gone, a to_be_deleted link ignores them, and its on-done
	hook would take the row emptying for the delete being done. ``issue: delete`` can't
	go into it, because the inbound handler would not delete the Issue.
	"""
	name = inbound_job(link)
	if not name:
		return False
	entries = delta.parse_delta(frappe.db.get_value(store.RETRY_JOB, name, "delta", for_update=True)) or {}
	if entries.get(delta.ISSUE_RESOURCE) == delta.DELETE:
		return True
	frappe.delete_doc(store.RETRY_JOB, name, ignore_permissions=True, force=True)
	return False


def clear_job_references(link: frappe._dict) -> None:
	"""A Retry Job row naming the Task would fail Frappe's dynamic link check."""
	for name in retry_jobs(link):
		frappe.db.set_value(store.RETRY_JOB, name, "reference_name", None, update_modified=False)


def on_tag_link_insert(doc: Document, method: str | None = None) -> None:
	if doc.document_type != "Task" or (doc.tag or "").strip().casefold() != GITHUB_TAG or bot.inbound():
		return
	guarded(tags_changed, doc.document_name)


def guard_task_rename(
	doc: Document,
	method: str | None = None,
	old: str | None = None,
	new: str | None = None,
	merge: bool = False,
) -> None:
	"""A linked Task keeps its name, which is the marker in its Issue's body.

	Frappe's rename_doc runs this whether or not ``force`` is set. Only a caller
	passing ``validate=False`` skips before_rename, and so skips this too.
	"""
	if frappe.db.exists(store.ISSUE_SYNC, {"task": old or doc.name}):
		frappe.throw(
			_("This task is linked to a GitHub Issue, so it can't be renamed."), frappe.ValidationError
		)


# Where a link's work goes.


class Target(TypedDict):
	"""Where a link's GitHub work goes: its route's repository, right now."""

	route: dict
	installation_id: str
	full_name: str


def target(link: Document | frappe._dict) -> tuple[Target | None, str | None]:
	"""The link's repository and installation, or why work cannot run now.

	``destination_changed`` when the Project now routes elsewhere: the link
	keeps its own repository and is never rerouted.
	"""
	route = projects.route_for(project=link.project)
	blocker = projects.sync_blocker(route)
	if blocker:
		return None, blocker
	if route["repository"] != link.repository_id:
		return None, "destination_changed"
	row = route["repository_row"]
	return {"route": route, "installation_id": row.installation, "full_name": row.full_name}, None


# sync_state (docs/adr/0008, setu.github.link_state).


def inbound_job(link: frappe._dict) -> str | None:
	"""The Issue's github:issue Retry Job row, the only row a webhook merges into."""
	if not (link.repository_id and link.repository_provider_issue_id):
		return None
	key = delta.inbound_job_key(link.repository_id, link.repository_provider_issue_id)
	return frappe.db.exists(store.RETRY_JOB, key) or None


def outbound_job(link_name: str) -> str | None:
	"""The link's github:task Retry Job row. Found by ``target.link``, because
	the row's key keeps the Task's name after the Task is deleted."""
	# A substring match narrows the rows whatever the JSON spacing; the parse decides.
	rows = frappe.get_all(
		store.RETRY_JOB,
		filters={
			"job_key": ["like", f"{delta.OUTBOUND_KEY_PREFIX}%"],
			"target": ["like", f"%{link_name}%"],
		},
		fields=["name", "target"],
	)
	return next(
		(row.name for row in rows if (delta.parse_object(row.target) or {}).get("link") == link_name), None
	)


def retry_jobs(link: frappe._dict) -> list[str]:
	return [name for name in (inbound_job(link), outbound_job(link.name)) if name]


def delete_retry_jobs(link: frappe._dict, keep_job: str | None = None) -> None:
	for name in retry_jobs(link):
		if name != keep_job:
			frappe.delete_doc(store.RETRY_JOB, name, ignore_permissions=True, force=True)


def pending_keys(link_name: str) -> set[str]:
	"""Envision's keys waiting to be pushed, in link.delta and in the link's outbound row."""
	entries = delta.parse_delta(frappe.db.get_value(store.ISSUE_SYNC, link_name, "delta")) or {}
	row = outbound_job(link_name)
	row_entries = delta.parse_delta(frappe.db.get_value(store.RETRY_JOB, row, "delta")) if row else None
	return {*entries, *(row_entries or {})}


def job_task_name(link: frappe._dict) -> str:
	"""The name a link's outbound row is keyed on: the existing row's, else the Task's.

	A link whose Task is gone and has no row has no Task name left, so the link's
	own name takes its place: the row is found by ``target.link``, never by its key.
	"""
	existing = outbound_job(link.name)
	if existing:
		return existing.removeprefix(delta.OUTBOUND_KEY_PREFIX)
	return link.task or link.name


def state_facts(link: frappe._dict) -> link_state.Facts:
	entries = delta.parse_delta(link.delta) or {}
	return link_state.Facts(
		has_issue=bool(link.repository_provider_issue_id),
		link_delta=entries,
		has_retry_job=bool(retry_jobs(link)),
	)


def fill_issue_identity(marker: str, repository_id: str, identity: dict[str, str | int]) -> str | None:
	"""Envision's own Issue: give the link of the marker's Task its Issue, if it has
	none yet, so a create whose response was lost finds it there
	(``outbound.ensure_created``). Never imports, and never replaces an Issue. Returns
	the link's name, or None when it has none. Read first: locking a missing row takes
	a gap lock."""
	name = frappe.db.get_value(
		store.ISSUE_SYNC, {"task": marker, "origin": "Envision", "repository_id": repository_id}, "name"
	)
	link = locked_link(name) if name else None
	if not link:
		return None
	if not link.repository_provider_issue_id:
		frappe.db.set_value(store.ISSUE_SYNC, link.name, identity, update_modified=False)
		settle(link.name)
	return link.name


def locked_link(link_name: str) -> frappe._dict | None:
	return frappe.db.get_value(store.ISSUE_SYNC, link_name, STATE_FIELDS, as_dict=True, for_update=True)


def settle(link_name: str) -> link_state.LinkState | None:
	"""Work out a link's sync_state again after its delta or Retry Job rows changed.

	A mark (to_be_deleted, unlinked) is kept; anything else is read from the
	facts, so synced always means nothing is pending in either direction, and
	cron_sync always has a row behind it. Returns the state, or None with no row.
	"""
	link = locked_link(link_name)
	if not link:
		return None
	state = link_state.settled_state(link.sync_state, state_facts(link))
	if state != link.sync_state:
		if not link_state.can_transition(link.sync_state, state):
			raise ValueError(f"sync_state {link.sync_state} → {state} is not allowed")
		values: dict[str, object] = {"sync_state": state}
		if state == link_state.SYNCED:
			values["last_synced_at"] = now_datetime()
		frappe.db.set_value(store.ISSUE_SYNC, link_name, values, update_modified=False)
	return state


def job_link_name(job: frappe._dict) -> str | None:
	"""The link a Retry Job row belongs to, if it has one."""
	target = delta.parse_object(job.target) or {}
	if delta.job_direction(job.job_key) == "outbound":
		link_name = target.get("link")
	else:
		link_name = frappe.db.get_value(
			store.ISSUE_SYNC,
			{
				"repository_id": target.get("repository_id"),
				"repository_provider_issue_id": target.get("issue_id"),
			},
			"name",
		)
	return link_name if isinstance(link_name, str) and link_name else None


def lock_for_job(job: frappe._dict) -> None:
	"""Retry Job lock hook (hooks.py retry_job_lock): the link's lock comes before the
	row's, as everywhere else. ``mark_synced`` needs it once the row has been locked."""
	link_name = job_link_name(job)
	if link_name:
		locked_link(link_name)


def mark_synced(job: frappe._dict) -> None:
	"""Retry Job on-done hook (hooks.py retry_job_on_done), called after the cron
	deletes an emptied row, in the same transaction.

	To be deleted: the delete is done, so the link row goes. Otherwise the
	link settles: cron_sync while another row exists, to_be_updated while
	link.delta holds Envision keys, else synced. Never synced over pending work.
	"""
	link_name = job_link_name(job)
	link = locked_link(link_name) if link_name else None
	if not link:
		return
	if link.sync_state == link_state.TO_BE_DELETED:
		delete_link(link)
		return
	settle(link_name)


def delete_link(link: frappe._dict, keep_job: str | None = None) -> None:
	"""Delete a link row and every Retry Job row for it, in both directions, except
	``keep_job``: the row a handler in cron mode is running, which the cron owns."""
	delete_retry_jobs(link, keep_job)
	store.delete_comment_links([link.name])
	frappe.db.delete(store.ISSUE_SYNC, {"name": link.name})


# Turning sync off.


def stop_sync(project: str, repository: str) -> None:
	"""Sync off, in the caller's one transaction: a manager turning it off, a repository
	disconnect or a global app disconnect. Link rows, link.delta and github:task rows stay,
	and sync_enabled is off. github:issue rows go, because turning sync on re-reads those
	Issues, and a link left with no row and no keys settles as synced.

	The route row is locked first, so this runs after a commit of the import job or
	before its next one, and the job cleans up after that one (setu.github.activation).
	"""
	route = {"project": project, "repository": repository}
	frappe.db.get_value(projects.PROJECT_ROUTE, route, "name", for_update=True)
	# Locked before the rows, as everywhere else, in name order.
	waiting = frappe.get_all(
		store.ISSUE_SYNC,
		filters={"project": project, "sync_state": link_state.CRON_SYNC},
		pluck="name",
		order_by="name asc",
	)
	for name in waiting:
		locked_link(name)
	frappe.db.set_value(
		projects.PROJECT_ROUTE,
		route,
		{
			"sync_enabled": 0,
			"activation_import_state": None,
			"activation_import_page": 0,
			"last_error": None,
		},
	)
	names = discardable_inbound_rows(repository)
	if names:
		frappe.db.delete(store.RETRY_JOB, {"name": ["in", names]})
	for name in waiting:
		settle(name)


def discardable_inbound_rows(repository: str) -> list[str]:
	"""Every github:issue row of the repository except those holding ``issue: delete``.
	Found by key, so a row with no link goes too: an Issue not imported yet belongs to
	the repository. A locking read, to see a row committed after this transaction began."""
	job = frappe.qb.DocType(store.RETRY_JOB)
	rows = (
		frappe.qb.from_(job)
		.select(job.name, job.delta)
		.where(job.name.like(f"{delta.INBOUND_KEY_PREFIX}{repository}:%"))
		.for_update()
	).run(as_dict=True)
	return [
		row.name
		for row in rows
		if not link_state.kept_on_sync_off(delta.parse_delta(row.delta) or {}, inbound=True)
	]


# Projection for the Task page (setu.api.github.get_task_github).


def state_message(state: link_state.LinkState, sync_on: bool) -> str | None:
	"""A link's state in plain words. The Task is gone from every to_be_deleted link but
	one: GitHub deleted the Issue and deleting the Task was refused."""
	if state == link_state.SYNCED:
		return None
	if state == link_state.TO_BE_DELETED:
		return _(
			"Its Issue was deleted on GitHub, but deleting this task was refused. Envision keeps retrying."
		)
	if state == link_state.UNLINKED:
		return _(
			"No longer synced: this task moved to another project, or became a milestone or template. The task and its Issue are both kept."
		)
	if not sync_on:
		return _("Sync is off for this project. Changes wait until it is turned on.")
	if state == link_state.NOT_SYNCED:
		return _("Waiting to create its Issue on GitHub.")
	if state == link_state.TO_BE_UPDATED:
		return _("Changes are waiting to go to GitHub.")
	return _("Envision keeps retrying this sync until it finishes.")


def route_view(project: str) -> tuple[RouteView, dict | None]:
	route = projects.route_for(project=project)
	blocker = projects.sync_blocker(route)
	repository = None
	if route:
		row = route["repository_row"]
		repository = {
			"id": route["repository"],
			"full_name": row.full_name if row else None,
			"html_url": row.html_url if row else None,
			"private": bool(row.private) if row else None,
		}
	return (
		{
			"connected": bool(route),
			"sync_enabled": bool(route and route["sync_enabled"]),
			"blocker": blocker,
			"blocker_message": projects.inactive_message(blocker) if blocker else None,
			"repository": repository,
		},
		route,
	)


def retry_error(error_log: str | None) -> str | None:
	"""A row's latest failure, as a Task reader may see it: the message kept as safe to
	show, else a general one. The Error Log itself holds source locations."""
	if not error_log:
		return None
	return store.logged_detail(error_log) or _(
		"Envision could not complete this sync step. The Error Log has the cause."
	)


def retry_views(link: frappe._dict) -> list[RetryView]:
	names = retry_jobs(link)
	if not names:
		return []
	rows = frappe.get_all(
		store.RETRY_JOB, filters={"name": ["in", names]}, fields=RETRY_VIEW_FIELDS, order_by="name asc"
	)
	return [
		{
			"direction": delta.job_direction(row.job_key) or "outbound",
			"running": row.status == RUNNING,
			"attempts": row.attempts or 0,
			"next_retry_at": clock.site_iso(row.next_retry_at),
			"error": retry_error(row.error_log),
		}
		for row in rows
	]


def link_view(link: frappe._dict, route: RouteView) -> LinkView:
	moving = route["sync_enabled"] and route["blocker"] is None
	pending = moving and link.sync_state not in (link_state.SYNCED, link_state.UNLINKED)
	return {
		"state": link.sync_state,
		"message": state_message(link.sync_state, route["sync_enabled"]),
		"issue_number": link.issue_number or None,
		"issue_url": link.issue_url or None,
		"repository_full_name": link.repository_full_name or None,
		"origin": link.origin or None,
		"last_synced_at": clock.site_iso(link.last_synced_at),
		"pending": pending,
		"uncertain": bool(pending and not link.repository_provider_issue_id and link.create_requested_at),
		"retries": retry_views(link),
	}


def can_retry(link: frappe._dict, route: dict | None) -> bool:
	"""Whether a retry has anything to bring forward: Project sync on for the link's own
	repository, and a Retry Job row or keys on link.delta. An unlinked link has neither."""
	if not route or not route["sync_enabled"] or route["repository"] != link.repository_id:
		return False
	return bool(delta.parse_delta(link.delta) or retry_jobs(link))


def task_projection(task: Document) -> TaskGitHub:
	"""What a Task reader sees of its GitHub link. The caller checked read."""
	tags = frappe.db.get_value("Task", task.name, "_user_tags")
	tagged = has_github_tag(tags)
	reason = ineligible_reason(task)
	# A Task without a Project has no route: route_for returns None for it.
	route, raw_route = route_view(task.project or "")
	link = link_for_task(task.name)
	view = link_view(link, route) if link else None
	can_write = bool(task.has_permission("write"))
	waiting = None
	if tagged and not link and not reason:
		waiting = route["blocker"] or ("publishing" if raw_route and raw_route["sync_enabled"] else None)
	return {
		"task": task.name,
		"tagged": tagged,
		"eligible": reason is None,
		"ineligible_reason": reason,
		"waiting_reason": waiting,
		"waiting_message": waiting_message(waiting),
		"route": route,
		"link": view,
		"can_write": can_write,
		"actions": {
			"retry": bool(can_write and link and can_retry(link, raw_route)),
		},
	}


def waiting_message(waiting: str | None) -> str | None:
	if waiting == "publishing":
		return _("Publishing to GitHub shortly.")
	return projects.inactive_message(waiting) if waiting else None
