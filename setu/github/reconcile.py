"""Two-way reconciliation of one linked Task and its Issue, field by field.

Each field (title, description, status, parent) keeps the last values both
sides agreed on: the Task's side and the Issue's side separately, since a
conversion or a length limit can make them differ. Each run reads the Issue
fresh and compares both current values with those baselines:

- changed on one side only → copied to the other side;
- changed on both sides to the same thing → accepted;
- title, status and parent changed differently on both sides → a conflict
  keeps both values until a user chooses a side;
- descriptions flow automatically: a changed GitHub body is applied,
  otherwise a changed Task description is pushed, with best-effort formatting.
  Descriptions never require a manual choice.

Our own writes come back as webhooks with values equal to the new baselines,
so they change nothing (echo suppression without ignoring the bot). Status
exceptions follow docs/adr/0008: a close as not planned, a close while the
Task is Blocked, and a reopen of a Done Task are conflicts, not automatic
changes. Changes from GitHub are saved as the integration user through the
normal Task save, so every ERPNext and Envision validation runs; a refused
change is a visible error, never bypassed.

Retrying is safe: if the Issue was patched but the local transaction failed,
the next run finds both sides changed to the same value and accepts it.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, today
from githubkit_schemas.v2022_11_28.types import ReposOwnerRepoIssuesIssueNumberPatchBodyType

from setu.api.task import check_no_open_subtasks, check_parent_due_date, check_parent_rules, note_subtask
from setu.github import bot, convert, issues, links, outbound, store, titles
from setu.github.client import GitHubError
from setu.github.issues import IssueData

FieldName = Literal["title", "description", "status", "parent"]
Action = Literal["push", "apply", "accept"]
NOT_PLANNED = ("not_planned", "duplicate")
# A parent whose Issue is still being created: hierarchy waits for it.
PENDING = "pending"


@dataclass
class Conflict:
	field: FieldName
	kind: str
	local_value: str
	remote_value: str
	dropped: list[str] = field(default_factory=list)


@dataclass
class Plan:
	actions: dict[str, Action] = field(default_factory=dict)
	patch: ReposOwnerRepoIssuesIssueNumberPatchBodyType = field(
		default_factory=ReposOwnerRepoIssuesIssueNumberPatchBodyType
	)
	task_values: dict[str, str | None] = field(default_factory=dict)
	# Whether the title last synced continued in the description, so its note
	# is found even without its marker (setu.github.titles.continues).
	continued: bool = False
	# The description's title note once GitHub's title applies: its note, ""
	# for none, None to leave it (setu.github.titles).
	note: str | None = None
	status: str | None = None
	conflicts: list[Conflict] = field(default_factory=list)
	# Field → the choice applied ("envision"/"github") and who chose it.
	resolved: dict[str, tuple[str, str]] = field(default_factory=dict)
	# The parent Issue id this Issue should be under (None: top level).
	hierarchy_target: str | None = None
	local_parent: str | None = None
	errors: list[str] = field(default_factory=list)
	hierarchy_error: str | None = None
	keep_hierarchy_error: bool = False
	applied: list[str] = field(default_factory=list)
	# Fields whose chosen resolution could not be applied: the choice is
	# cleared so the user can see the error and choose again.
	reset: set[str] = field(default_factory=set)

	def drop(self, name: str) -> None:
		"""Leave a field's baselines alone after its change failed."""
		self.actions.pop(name, None)
		if self.resolved.pop(name, None):
			self.reset.add(name)


def reconcile(link_name: str, op_name: str) -> store.Outcome:
	link = frappe.get_doc(store.ISSUE_SYNC, link_name)
	if link.sync_state == "Tombstoned" or not link.task:
		return store.outcome("Cancelled")
	if link.sync_state == "Paused":
		return store.outcome("Waiting")
	if not link.issue_id:
		# The create reconciles once the Issue exists.
		return store.outcome("Cancelled")
	found, blocker = links.target(link)
	if blocker or not found:
		return links.blocked(link_name, blocker or "not_connected")
	task = frappe.get_doc("Task", link.task)
	if task.project != link.project:
		store.pause_links({"name": link_name}, "project_changed")
		return store.outcome("Waiting")
	if links.ineligible_reason(task):
		store.pause_links({"name": link_name}, "task_ineligible")
		return store.outcome("Waiting")
	try:
		issue = issues.get_issue(found["installation_id"], found["full_name"], link.issue_number)
	except GitHubError as exc:
		reason = lost_reason(exc)
		if not reason:
			raise
		store.pause_links({"name": link_name}, reason)
		return store.outcome("Waiting", error=str(exc))
	if issue["id"] != link.issue_id:
		store.pause_links({"name": link_name}, "transferred")
		return store.outcome("Waiting")

	conflicts = {row.field: row for row in link.conflicts}
	plan = Plan(continued=titles.continues(subject_limit(), link.base_title_local, link.base_title_remote))
	plan_title(plan, link, task, issue, conflicts.get("title"))
	plan_description(plan, link, task, issue, conflicts.get("description"))
	plan_status(plan, link, task, issue, conflicts.get("status"))
	plan_parent(plan, link, task, conflicts.get("parent"))

	response = issue
	if plan.patch:
		response = issues.update_issue(
			found["installation_id"], found["full_name"], link.issue_number, plan.patch
		)
	saved = apply_local(plan, task)
	if "parent" in plan.actions and plan.actions["parent"] == "push":
		push_hierarchy(plan, link, found)
	finish(link_name, plan, saved, issue, response)
	if (
		response["sub_issue_count"]
		and response["state"] == "open"
		and saved.status != "Completed"
		and (link.base_status == "Completed" or link.base_state == "closed")
	):
		# Reopening a parent makes its previously skipped children eligible.
		from setu.github import inbound

		inbound.observe_sub_issues(found, issue["id"], issue["number"])
	return store.outcome("Done")


def lost_reason(exc: GitHubError) -> store.PauseReason | None:
	"""Errors that pause the link for review instead of being retried."""
	if exc.rate_limited or exc.uncertain:
		return None
	if exc.status == 301:
		return "transferred"
	if exc.status in (404, 410):
		return "remote_deleted"
	if exc.status == 403:
		return "access_lost"
	return None


def subject_limit() -> int:
	subject = frappe.get_meta("Task").get_field("subject")
	return int(subject.length) if subject and subject.length else 140


def resolution(row: Document | None) -> tuple[str, str] | None:
	if row is None or not row.resolution:
		return None
	return row.resolution, row.resolved_by or ""


# Planning, per field.


def plan_title(plan: Plan, link: Document, task: Document, issue: IssueData, row: Document | None) -> None:
	# The Task's whole title: its subject and the note continuing it.
	local = titles.title(task.subject, task.description, plan.continued)
	remote = issue["title"].strip()
	agreed = titles.same(local, titles.stored(remote))
	chosen = resolution(row)
	if chosen:
		plan.resolved["title"] = chosen
		if chosen[0] == "envision":
			push_title(plan, local)
		else:
			apply_title(plan, remote)
		return
	if plan.continued and titles.unmarked(task.description):
		# A non-Envision editor may remove the marker. Preserve all text and
		# require a title choice instead of guessing which paragraph is ours.
		plan.conflicts.append(
			Conflict("title", "both_changed", local, remote, ["title_continuation_marker_missing"])
		)
		return
	if row is not None:
		if agreed:
			# Someone made both sides agree: nothing is left to choose.
			plan.actions["title"] = "accept"
		elif row.kind == "title_too_long" and (
			titles.same(local, link.base_title_local)
			or titles.same(local, titles.stored(titles.split(remote, subject_limit())[0]))
		):
			# Raised before long titles continued in the description, and the
			# subject was not edited since: GitHub's title applies as now.
			apply_title(plan, remote)
		else:
			plan.conflicts.append(Conflict("title", row.kind, local, remote))
		return
	local_changed = not titles.same(local, link.base_title_local)
	remote_changed = not titles.same(remote, link.base_title_remote)
	if not local_changed and not remote_changed:
		return
	if agreed:
		# The same change on both sides, a retried push, or baselines that
		# only differed in form: both sides already agree, so nothing is sent.
		plan.actions["title"] = "accept"
	elif local_changed and remote_changed:
		plan.conflicts.append(Conflict("title", "both_changed", local, remote))
	elif local_changed:
		push_title(plan, local)
	else:
		apply_title(plan, remote)


def push_title(plan: Plan, value: str) -> None:
	"""The Task's whole title to GitHub, never shortened. A title longer than
	GitHub allows is an error that changes neither side."""
	if len(value) > outbound.MAX_TITLE_LENGTH:
		plan.errors.append(
			_(
				"This task's title, with its GitHub title continuation, is {0} characters; GitHub allows {1}. Shorten it to sync the title."
			).format(len(value), outbound.MAX_TITLE_LENGTH)
		)
		plan.drop("title")
		return
	# The Task keeps its subject and note as they are.
	plan.patch["title"] = value
	plan.actions["title"] = "push"


def apply_title(plan: Plan, value: str) -> None:
	"""GitHub's title on the Task: what fits in the subject, and the rest in
	the description's note. GitHub's title is never shortened."""
	subject, rest = titles.split(value, subject_limit())
	plan.task_values["subject"] = subject
	plan.note = titles.note(rest)
	plan.actions["title"] = "apply"


def plan_description(
	plan: Plan, link: Document, task: Document, issue: IssueData, row: Document | None
) -> None:
	# Ambiguous unmarked text is never removed or sent as a body edit while
	# its title ownership is unresolved. A title choice repairs the marker.
	if plan.continued and titles.unmarked(task.description):
		return
	# The title's note is not part of the description (setu.github.titles).
	html = titles.content(task.description, plan.continued)
	body = issue["body"]
	local_changed = convert.description_changed(html, link.base_description_hash)
	remote_changed = convert.body_changed(body, link.base_body_hash)
	# Retire legacy inbound conflicts by reimporting the original Markdown,
	# unless the Task has been edited since the conflict snapshot was taken.
	legacy_inbound = (
		row is not None
		and row.kind == "lossy_inbound"
		and convert.html_digest(html) == convert.html_digest(row.local_value)
	)
	if remote_changed or legacy_inbound:
		# A retried outbound write may already be on GitHub. Accept it without
		# round-tripping away formatting still present in the Task.
		if local_changed and not legacy_inbound:
			result = outbound.body_for(link.create_marker, html, body)
			if not result["changed"]:
				plan.actions["description"] = "accept"
				return
		apply_description(plan, convert.markdown_to_html(body)["html"])
		return
	# Old outbound conflicts may have matching baselines despite publishing
	# only a marker. Send their description now, without a manual decision.
	legacy_outbound = row is not None and row.kind in ("lossy_outbound", "too_long", "both_changed")
	if local_changed or legacy_outbound:
		result = outbound.body_for(link.create_marker, html, body)
		if "body_too_long" in result["dropped"]:
			plan.errors.append(outbound.body_size_error())
			return
		push_body(plan, result["body"], result["changed"])
	elif row is not None:
		plan.actions["description"] = "accept"


def push_body(plan: Plan, body: str, changed: bool) -> None:
	# Never rewrite a body GitHub already shows.
	if changed:
		plan.patch["body"] = body
		plan.actions["description"] = "push"
	else:
		plan.actions["description"] = "accept"


def apply_description(plan: Plan, html: str) -> None:
	plan.task_values["description"] = html
	plan.actions["description"] = "apply"


def plan_status(plan: Plan, link: Document, task: Document, issue: IssueData, row: Document | None) -> None:
	local = task.status
	local_done = local == "Completed"
	remote_closed = issue["state"] == "closed"
	remote_label = (
		f"closed ({issue['state_reason']})" if remote_closed and issue["state_reason"] else issue["state"]
	)
	chosen = resolution(row)
	if chosen:
		plan.resolved["status"] = chosen
		if chosen[0] == "envision":
			push_state(plan, local_done)
		else:
			plan.status = "Completed" if remote_closed else "Open"
			plan.actions["status"] = "apply"
		return
	if row is not None:
		if local_done == remote_closed:
			# Both sides agree again (the Issue was reopened under an active
			# Task, or closed again under a Done one): nothing to choose.
			plan.actions["status"] = "accept"
		else:
			plan.conflicts.append(Conflict("status", row.kind, local, remote_label))
		return
	local_changed = local_done != ((link.base_status or "Open") == "Completed")
	remote_changed = remote_closed != ((link.base_state or "open") == "closed")
	if local_changed and remote_changed:
		if local_done == remote_closed:
			plan.actions["status"] = "accept"
		else:
			plan.conflicts.append(Conflict("status", "both_changed", local, remote_label))
	elif local_changed:
		push_state(plan, local_done)
	elif remote_changed and remote_closed:
		if issue["state_reason"] in NOT_PLANNED:
			plan.conflicts.append(Conflict("status", "closed_not_planned", local, remote_label))
		elif local == "Blocked":
			plan.conflicts.append(Conflict("status", "closed_while_blocked", local, remote_label))
		elif local_done:
			plan.actions["status"] = "accept"
		else:
			plan.status = "Completed"
			plan.actions["status"] = "apply"
	elif remote_changed:
		# Reopened on GitHub. Envision does not reopen a Done Task by itself.
		if local_done:
			plan.conflicts.append(Conflict("status", "remote_reopened", local, remote_label))
		else:
			plan.actions["status"] = "accept"
	elif local != link.base_status:
		# Moves between active statuses: the Issue stays open, nothing to send.
		plan.actions["status"] = "accept"


def push_state(plan: Plan, done: bool) -> None:
	if done:
		plan.patch["state"] = "closed"
		plan.patch["state_reason"] = "completed"
	else:
		plan.patch["state"] = "open"
	plan.actions["status"] = "push"


def mapped_parent(task: Document, link: Document) -> str | None:
	"""The Issue id the Task's parent maps to: None for no parent or an
	unpublished one (a standalone Issue), PENDING while its Issue is created."""
	if not task.parent_task:
		return None
	parent = links.link_for_task(task.parent_task)
	if not parent or parent.project != link.project or parent.repository_id != link.repository_id:
		return None
	if parent.sync_state == "Tombstoned":
		return None
	if parent.issue_id:
		return parent.issue_id
	return PENDING if parent.sync_state == "Pending" else None


def plan_parent(plan: Plan, link: Document, task: Document, row: Document | None) -> None:
	local = mapped_parent(task, link)
	if local == PENDING:
		plan.keep_hierarchy_error = True
		return
	plan.local_parent = local
	base = link.base_parent_issue_id or None
	remote = link.remote_parent_issue_id or None
	chosen = resolution(row)
	if chosen:
		plan.resolved["parent"] = chosen
		if chosen[0] == "envision":
			plan.hierarchy_target = local
			plan.actions["parent"] = "push"
		else:
			apply_parent(plan, link, remote)
		return
	if row is not None:
		if local == remote:
			plan.actions["parent"] = "accept"
		else:
			plan.conflicts.append(Conflict("parent", row.kind, parent_label(local), parent_label(remote)))
		return
	local_changed = local != base
	remote_changed = remote != base
	if local_changed and remote_changed:
		if local == remote:
			plan.actions["parent"] = "accept"
		else:
			plan.conflicts.append(
				Conflict("parent", "both_changed", parent_label(local), parent_label(remote))
			)
	elif local_changed:
		plan.hierarchy_target = local
		plan.actions["parent"] = "push"
	elif remote_changed:
		apply_parent(plan, link, remote)


def apply_parent(plan: Plan, link: Document, remote: str | None) -> None:
	if remote is None:
		plan.task_values["parent_task"] = None
		plan.actions["parent"] = "apply"
		return
	parent = links.link_for_issue(remote)
	if not parent or not parent.task or parent.project != link.project or parent.sync_state == "Tombstoned":
		plan.hierarchy_error = _(
			"On GitHub this Issue is a sub-issue of an Issue that isn't synced to this project, so its parent task was not changed."
		)
		plan.drop("parent")
		return
	plan.task_values["parent_task"] = parent.task
	plan.actions["parent"] = "apply"


def parent_label(issue_id: str | None) -> str:
	if not issue_id:
		return ""
	row = frappe.db.get_value(
		store.ISSUE_SYNC, {"issue_id": issue_id}, ["issue_number", "task"], as_dict=True
	)
	if not row:
		return issue_id
	return f"#{row.issue_number}" + (f" ({row.task})" if row.task else "")


# Applying.


def apply_local(plan: Plan, task: Document) -> Document:
	"""Save GitHub's changes on the Task as the integration user. A refused
	save is recorded as an error and leaves those fields' baselines alone."""
	values, noted = local_values(plan, task)
	if not values and not plan.status:
		return task
	previous_parent = task.parent_task or None
	with bot.as_bot():
		if values:
			error = save_fields(task, values)
			if error:
				plan.errors.append(error)
				for name, field_name in (
					("subject", "title"),
					("description", "description"),
					("parent_task", "parent"),
				):
					if name in plan.task_values:
						plan.drop(field_name)
				if noted:
					# The note belongs to the title: the next run writes it.
					plan.drop("title")
				task.reload()
			else:
				plan.applied.extend(
					label
					for name, label in (
						("subject", _("title")),
						("description", _("description")),
						("parent_task", _("parent task")),
					)
					if name in plan.task_values
				)
				if (task.parent_task or None) != previous_parent:
					if previous_parent:
						note_subtask(previous_parent, _("Moved out subtask {0}").format(task.subject))
					if task.parent_task:
						note_subtask(task.parent_task, _("Moved in subtask {0}").format(task.subject))
		if plan.status:
			error = save_status(task, plan.status)
			if error:
				plan.errors.append(error)
				plan.drop("status")
				task.reload()
			else:
				plan.applied.append(_("status"))
	return task


def local_values(plan: Plan, task: Document) -> tuple[dict[str, str | None], bool]:
	"""The Task fields to save: GitHub's changes, with the title's note kept
	in or written to the description; and whether the note changes. A note
	already right writes nothing."""
	values = dict(plan.task_values)
	current = task.description or ""
	noted = plan.note is not None and titles.compose(current, None, plan.note, plan.continued) != current
	if "description" in values or noted:
		values["description"] = titles.compose(current, values.get("description"), plan.note, plan.continued)
	return values, noted


def save_fields(task: Document, values: dict[str, str | None]) -> str | None:
	frappe.db.savepoint("envision_github_task")
	try:
		if "parent_task" in values:
			parent = values["parent_task"]
			if parent and parent != task.parent_task:
				check_parent_rules(task, frappe.get_doc("Task", parent))
			task.parent_task = parent
			if parent:
				check_parent_due_date(task)
		if "subject" in values:
			task.subject = values["subject"]
		if "description" in values:
			task.description = values["description"]
		task.save(ignore_permissions=True)
	except frappe.TimestampMismatchError:
		raise
	except frappe.ValidationError as exc:
		frappe.db.rollback(save_point="envision_github_task")
		return store.error_text(exc)
	return None


def save_status(task: Document, status: str) -> str | None:
	"""Completion follows update_task's bookkeeping and refusals."""
	frappe.db.savepoint("envision_github_task")
	try:
		if status == "Completed" and task.status != "Completed":
			check_no_open_subtasks(task)
			if not task.completed_on:
				task.completed_on = today()
				task.completed_by = bot.BOT_USER
		elif task.status == "Completed" and status != "Completed":
			# Only an explicit conflict resolution reaches this reopening path.
			task.completed_on = None
			task.completed_by = None
			task.progress = 0
		task.status = status
		task.save(ignore_permissions=True)
	except frappe.TimestampMismatchError:
		raise
	except frappe.ValidationError as exc:
		frappe.db.rollback(save_point="envision_github_task")
		return store.error_text(exc)
	return None


def push_hierarchy(plan: Plan, link: Document, found: links.Target) -> None:
	"""Attach the Issue under its parent's Issue, or detach it. GitHub's limits
	(nesting depth, sub-issues per parent) are shown, never worked around by
	flattening the tree."""
	target = plan.hierarchy_target
	try:
		if target:
			parent = links.link_for_issue(target)
			if not parent or not parent.issue_number:
				raise GitHubError("The parent Issue is not linked.", 422)
			issues.add_sub_issue(
				found["installation_id"], found["full_name"], parent.issue_number, link.issue_id
			)
		elif link.remote_parent_issue_id:
			if not link.remote_parent_issue_number:
				raise GitHubError("The parent Issue on GitHub is in another repository.", 422)
			issues.remove_sub_issue(
				found["installation_id"], found["full_name"], link.remote_parent_issue_number, link.issue_id
			)
	except GitHubError as exc:
		if exc.rate_limited or exc.uncertain or exc.status not in (403, 404, 410, 422):
			raise
		plan.drop("parent")
		plan.hierarchy_error = _(
			"GitHub refused to change this Issue's parent (sub-issue depth or count limit, another repository, or access). The task's parent was kept."
		)


def finish(link_name: str, plan: Plan, task: Document, issue: IssueData, response: IssueData) -> None:
	doc = frappe.get_doc(store.ISSUE_SYNC, link_name, for_update=True)
	values: dict[str, str | int | datetime | None] = {}
	saved = frappe.db.get_value("Task", task.name, ["subject", "description"], as_dict=True)
	# Whether the saved description starts with the title's note: GitHub's
	# title says so when it was just applied, else the last synced titles do.
	continued = plan.continued
	action = plan.actions.get("title")
	if action == "apply":
		continued = bool(titles.split(issue["title"].strip(), subject_limit())[1])
	if action:
		values["base_title_local"] = titles.title(saved.subject, saved.description, continued)
		values["base_title_remote"] = response["title"] if action == "push" else issue["title"]
	action = plan.actions.get("description")
	if action:
		values["base_description_hash"] = convert.html_digest(titles.content(saved.description, continued))
		values["base_body_hash"] = convert.markdown_digest(
			response["body"] if action == "push" else issue["body"]
		)
	action = plan.actions.get("status")
	if action:
		source = response if action == "push" else issue
		values["base_status"] = task.status
		values["base_state"] = source["state"]
		values["base_state_reason"] = source["state_reason"]
	action = plan.actions.get("parent")
	if action == "push":
		parent = links.link_for_issue(plan.hierarchy_target) if plan.hierarchy_target else None
		values["base_parent_issue_id"] = plan.hierarchy_target
		values["remote_parent_issue_id"] = plan.hierarchy_target
		values["remote_parent_issue_number"] = parent.issue_number if parent else None
	elif action:
		values["base_parent_issue_id"] = doc.remote_parent_issue_id or None
	values.update(
		{
			"remote_body_markdown": response["body"],
			"remote_updated_at": response["updated_at"],
			"issue_url": response["html_url"] or doc.issue_url,
			"last_synced_at": now_datetime(),
			"error": "; ".join(plan.errors) or None,
		}
	)
	if not plan.keep_hierarchy_error:
		values["hierarchy_error"] = plan.hierarchy_error
	doc.update(values)
	settled = set(plan.actions)
	# Successful automatic description sync also retires any legacy row.
	# A failed Task save keeps it for retry, never as a manual UI choice.
	doc.set("conflicts", [row for row in doc.conflicts if row.field not in settled])
	for row in doc.conflicts:
		if row.field in plan.reset:
			row.resolution = None
			row.resolved_by = None
	for conflict in plan.conflicts:
		outbound.add_conflict(
			doc, conflict.field, conflict.kind, conflict.local_value, conflict.remote_value, conflict.dropped
		)
	if doc.sync_state in store.ACTIVE_STATES:
		if doc.error or doc.hierarchy_error:
			doc.sync_state = "Error"
		elif doc.conflicts:
			doc.sync_state = "Conflict"
		else:
			doc.sync_state = "Synced"
	doc.save(ignore_permissions=True)
	note_activity(task, plan, doc.last_actor_login)


def note_activity(task: Document, plan: Plan, actor: str | None) -> None:
	labels = {
		"title": _("title"),
		"description": _("description"),
		"status": _("status"),
		"parent": _("parent task"),
	}
	with bot.as_bot():
		if plan.applied:
			text = _("Updated from GitHub: {0}").format(", ".join(plan.applied))
			if actor:
				text += " " + _("(latest GitHub activity by @{0})").format(actor)
			task.add_comment("Info", text)
		for name, (choice, user) in plan.resolved.items():
			if name in plan.actions:
				side = "Envision" if choice == "envision" else "GitHub"
				task.add_comment(
					"Info",
					_("{0} kept the {1} version of the {2}.").format(
						user or _("Someone"), side, labels[name]
					),
				)
