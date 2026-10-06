import frappe
from frappe import _
from frappe.desk.form.assign_to import add as assign_to
from frappe.desk.form.assign_to import set_status as set_assignment_status
from frappe.model.delete_doc import get_dynamic_linked_docs, get_linked_docs, raise_link_exists_exception
from frappe.utils import getdate, today
from frappe.utils.nestedset import get_descendants_of

from setu.api.milestone import (
	ASSIGNED,
	as_date,
	assignee_details,
	assignees_of,
	envision_projects,
	replace_assignee,
)
from setu.api.timeline import comment_on, document_activity, people_details, timestamp
from setu.api.view import rename_filter_value

# Envision's Task endpoints (Paper: 03 — Create Task, 04 — Task Created, 09 —
# Task Detail). A
# Task is the standard ERPNext Task (docs/adr/0001). Envision adds its Blocked
# status and the Task's Milestone and Module links (setu/setup), and this
# module keeps both honest on every save, Desk included.

# The statuses a Task can be created in, one per Board column: Todo, In
# Progress, Review, Blocked and Done. Overdue is ERPNext's to set, and
# Envision does not support Cancelled (CONTEXT.md, Status).
CREATE_STATUSES = ("Open", "Working", "Pending Review", "Blocked", "Completed")
PRIORITIES = ("Low", "Medium", "High", "Urgent")


class EnvisionTask:
	"""Mixed into ERPNext's Task through ``extend_doctype_class``."""

	def update_status(self):
		# ERPNext's daily job turns every open Task past its due date into
		# Overdue. A Blocked Task stays Blocked: the blocker is the news, and
		# the Card still shows the due date.
		if self.status == "Blocked":
			return
		super().update_status()


def validate_task_links(doc, method=None) -> None:
	"""A Task's Milestone and Module must be in its own Project (doc_events)."""
	# Read with .get(): on a site that has not migrated yet the fields are missing.
	if doc.get("envision_milestone"):
		if doc.is_milestone:
			frappe.throw(_("A milestone cannot belong to another milestone."))
		milestone = frappe.db.get_value(
			"Task", doc.envision_milestone, ["is_milestone", "project"], as_dict=True
		)
		if not milestone or not milestone.is_milestone:
			frappe.throw(_("{0} is not a milestone.").format(doc.envision_milestone))
		if milestone.project != doc.project:
			frappe.throw(_("The milestone belongs to another project."))
	if doc.get("envision_module"):
		if frappe.db.get_value("Envision Module", doc.envision_module, "project") != doc.project:
			frappe.throw(_("The module belongs to another project."))


@frappe.whitelist(methods=["POST"])
def create_task(
	project: str,
	subject: str,
	description: str | None = None,
	start_date: str | None = None,
	due_date: str | None = None,
	status: str = "Open",
	priority: str = "Medium",
	assignee: str | None = None,
	milestone: str | None = None,
	module: str | None = None,
	tags: list[str] | str | None = None,
	assignees: list[str] | str | None = None,
) -> dict:
	"""Create a Task on a project (Paper: 03 — Create Task).

	- Opened from a Board column's "+", so the status is that column's.
	- The description arrives as HTML from Envision's rich text editor; Frappe
	  sanitizes it on save like any Text Editor value.
	- Each assignee becomes a standard Frappe assignment and the tags standard
	  Frappe document tags, so Desk, notifications and filters all see them.
	  ``assignees`` is the list of users; the older ``assignee`` (one user)
	  still works, and a request may send one or the other, not both.
	- POST only: the method writes, and Frappe commits after a successful POST.
	"""
	frappe.get_doc("Project", project).check_permission("read")
	check_one_assignee_field(assignee, assignees)
	if assignees is not None:
		assignees = clean_assignees(assignees, [])

	subject = (subject or "").strip()
	if not subject:
		frappe.throw(_("Task title is required"), frappe.MandatoryError)
	if status not in CREATE_STATUSES:
		frappe.throw(_("A task cannot be created as {0}.").format(status))
	if priority not in PRIORITIES:
		frappe.throw(_("Unknown priority {0}.").format(priority))
	# ERPNext refuses this too, but with a message about expected dates.
	if start_date and due_date and getdate(start_date) > getdate(due_date):
		frappe.throw(_("Start date cannot be after the due date."), frappe.exceptions.InvalidDates)

	task = frappe.new_doc("Task")
	task.project = project
	task.subject = subject
	task.description = (description or "").strip()
	task.exp_start_date = start_date or None
	task.exp_end_date = due_date or None
	task.status = status
	task.priority = priority
	task.envision_milestone = milestone or None
	task.envision_module = module or None
	if status == "Completed":
		# Mandatory on a Completed Task, as Desk asks for it.
		task.completed_on = today()
		task.completed_by = frappe.session.user
	task.insert()

	for tag in clean_tags(tags):
		task.add_tag(tag)
	if assignees:
		set_assignees(task, assignees)
	elif assignee:
		assign_to(
			{
				"doctype": "Task",
				"name": task.name,
				"assign_to": [assignee],
				"description": subject,
			}
		)
		close_new_assignments(task, [assignee])

	return {
		"name": task.name,
		"subject": task.subject,
		"status": task.status,
		"assignees": assignee_people(task.name),
	}


@frappe.whitelist()
def get_task(name: str) -> dict:
	"""One Task and its project's title (Paper: 09 — Task Detail)."""
	return task_detail(task_doc(name))


@frappe.whitelist(methods=["POST"])
def update_task(
	name: str,
	subject: str | None = None,
	description: str | None = None,
	start_date: str | None = None,
	due_date: str | None = None,
	status: str | None = None,
	priority: str | None = None,
	assignee: str | None = None,
	milestone: str | None = None,
	module: str | None = None,
	tags: list[str] | str | None = None,
	assignees: list[str] | str | None = None,
) -> dict:
	"""Save what changed on the Task (09: one "Save changes" for all).

	As on a milestone, ``None`` (not sent) leaves a field as it is and ``""``
	clears it, so an edit here never overwrites what someone changed in Desk
	meanwhile. Saved through the Task document, so ERPNext's validation, the
	Milestone and Module checks (validate_task_links), Frappe's write
	permission check and its HTML sanitising all run as they do in Desk. It is
	all one request, so if any part fails Frappe rolls back the rest.

	``assignees`` is everyone assigned (set_assignees): ``[]`` unassigns
	everyone, Desk's assignments included. The older ``assignee`` replaces
	only the first person (replace_assignee). A request sends one or the other.
	"""
	task = task_doc(name, "write")
	check_one_assignee_field(assignee, assignees)
	if assignees is not None:
		# Checked before anything is saved; people already assigned may stay
		# even if they cannot be assigned anew.
		assignees = clean_assignees(assignees, assignees_of([task.name])[task.name])

	if subject is not None:
		subject = subject.strip()
		if not subject:
			frappe.throw(_("Task title is required"), frappe.MandatoryError)
		task.subject = subject
	if description is not None:
		task.description = description.strip()
	if start_date is not None:
		task.exp_start_date = start_date or None
	if due_date is not None:
		task.exp_end_date = due_date or None
	# As on create: ERPNext refuses this too, but with a message about
	# expected dates.
	if (
		task.exp_start_date
		and task.exp_end_date
		and getdate(task.exp_start_date) > getdate(task.exp_end_date)
	):
		frappe.throw(_("Start date cannot be after the due date."), frappe.exceptions.InvalidDates)
	if status is not None:
		if status not in CREATE_STATUSES:
			frappe.throw(_("A task cannot be set to {0}.").format(status))
		if status == "Completed" and task.status != "Completed" and not task.completed_on:
			# Mandatory on a Completed Task, as Desk asks for it.
			task.completed_on = today()
			task.completed_by = frappe.session.user
		task.status = status
	if priority is not None:
		if priority not in PRIORITIES:
			frappe.throw(_("Unknown priority {0}.").format(priority))
		task.priority = priority
	if milestone is not None:
		task.envision_milestone = milestone or None
	if module is not None:
		task.envision_module = module or None

	fields = (subject, description, start_date, due_date, status, priority, milestone, module)
	if any(value is not None for value in fields):
		task.save()
	if tags is not None:
		replace_tags(task, clean_tags(tags))
	if assignees is not None:
		set_assignees(task, assignees)
	elif assignee is not None:
		assigned = assignees_of([task.name])[task.name]
		replace_assignee(task, assignee)
		if assignee and assignee not in assigned:
			close_new_assignments(task, [assignee])
	if tags is not None or assignee is not None or assignees is not None:
		task.reload()
	return task_detail(task)


def check_one_assignee_field(assignee: str | None, assignees) -> None:
	"""``assignee`` (one) and ``assignees`` (all) would disagree: one or the
	other per request, ``""`` and ``[]`` included."""
	if assignee is not None and assignees is not None:
		frappe.throw(_("Send either assignee or assignees, not both."))


def clean_assignees(assignees: list[str] | str, assigned: list[str]) -> list[str]:
	"""The users in ``assignees``, trimmed, without repeats, in the order sent.

	A list, or one sent as JSON. Users not already ``assigned`` must be ones
	the picker offers (setu.api.user.list_assignees): enabled System Users.
	Someone already assigned may stay after being disabled, so keeping the
	same people never fails.
	"""
	values = assignees
	if isinstance(assignees, str):
		try:
			values = frappe.parse_json(assignees)
		except ValueError:
			values = None
	if not isinstance(values, list | tuple):
		frappe.throw(_("Assignees must be a list of users."))
	users: dict[str, None] = {}
	for user in values:
		if not isinstance(user, str) or not user.strip():
			frappe.throw(_("Each assignee must be a user."))
		users[user.strip()] = None

	# User names compare without case in the database; use the stored name.
	found = (
		{
			row.name.casefold(): row
			for row in frappe.get_all(
				"User",
				filters={"name": ["in", list(users)]},
				fields=["name", "enabled", "user_type"],
			)
		}
		if users
		else {}
	)
	kept = {user.casefold(): user for user in assigned}
	cleaned: dict[str, None] = {}
	for user in users:
		key = user.casefold()
		if key in kept:
			cleaned[kept[key]] = None
			continue
		row = found.get(key)
		if not row:
			frappe.throw(_("User {0} does not exist.").format(user))
		if not row.enabled:
			frappe.throw(_("User {0} is disabled.").format(row.name))
		if row.user_type != "System User":
			frappe.throw(_("User {0} cannot be assigned to tasks.").format(row.name))
		cleaned[row.name] = None
	return list(cleaned)


def set_assignees(task, users: list[str]) -> None:
	"""Make ``users`` everyone assigned to the Task, through Frappe's own
	assignment API as Desk's "Assign To" does.

	Only the difference changes: people who stay keep their assignment (Open,
	or Closed on a Done Task) and their place, so sending the same people
	again does nothing. New people are added before anyone is removed, so a
	refused assignment (document sharing off and no access) fails the request
	first. A removed person's every assignment is cancelled, not only one.
	"""
	assigned = assignees_of([task.name])[task.name]
	added = [user for user in users if user not in assigned]
	removed = [user for user in assigned if user not in users]
	if added:
		assign_to(
			{
				"doctype": "Task",
				"name": task.name,
				"assign_to": added,
				"description": task.subject,
			}
		)
	if removed:
		for todo in frappe.get_all(
			"ToDo",
			filters={
				"reference_type": "Task",
				"reference_name": task.name,
				"allocated_to": ["in", removed],
				"status": ["in", ASSIGNED],
			},
			fields=["name", "allocated_to"],
		):
			set_assignment_status(
				"Task", task.name, todo=todo.name, assign_to=todo.allocated_to, status="Cancelled"
			)
	close_new_assignments(task, added)


def close_new_assignments(task, users: list[str]) -> None:
	"""Close the assignments just given to ``users`` on a Done Task.

	ERPNext closes a Task's assignments as it is Completed, but one added
	afterwards would stay Open, on the person's to-do list for finished work.
	Only these people's Open assignments are closed: anyone else keeps theirs.
	"""
	if task.status != "Completed" or not users:
		return
	for todo in frappe.get_all(
		"ToDo",
		filters={
			"reference_type": "Task",
			"reference_name": task.name,
			"allocated_to": ["in", users],
			"status": "Open",
		},
		fields=["name", "allocated_to"],
	):
		set_assignment_status("Task", task.name, todo=todo.name, assign_to=todo.allocated_to, status="Closed")


def assignee_people(task: str) -> list[dict]:
	"""Name and avatar of everyone assigned to the Task, first assigned first."""
	users = assignees_of([task])[task]
	people = people_details(set(users))
	return [people[user] for user in users if user in people]


def replace_tags(task, tags: list[str]) -> None:
	"""Make ``tags`` the Task's document tags, in Frappe's own tag records."""
	current = task_tags(task)
	wanted = {tag.casefold() for tag in tags}
	for tag in current:
		if tag.casefold() not in wanted:
			task.remove_tag(tag)
	have = {tag.casefold() for tag in current}
	for tag in tags:
		if tag.casefold() not in have:
			task.add_tag(tag)


def task_tags(task) -> list[str]:
	"""The Task's document tags, in the order they were added.

	Read from ``_user_tags`` rather than ``Document.get_tags``, which drops the
	first tag whenever the column has no leading comma.
	"""
	value = frappe.db.get_value("Task", task.name, "_user_tags") or ""
	return [tag for tag in value.split(",") if tag]


@frappe.whitelist()
def get_task_activity(name: str) -> dict:
	"""The Task's timeline (09: "Activity (Frappe form timeline)")."""
	return document_activity(task_doc(name))


@frappe.whitelist(methods=["POST"])
def add_task_comment(name: str, content: str, reply_to: str | None = None) -> dict:
	"""Comment on a Task (09: "Comment"), as Desk's timeline does."""
	return comment_on(task_doc(name, "read"), content, reply_to)


def task_doc(name: str, ptype: str = "read"):
	"""A Task the Board shows, after the permission check.

	Milestones have a page of their own and templates are not project work, so
	both are reported as missing and this page never opens or changes one.
	"""
	task = frappe.get_doc("Task", name)
	task.check_permission(ptype)
	if task.is_milestone or task.is_template:
		frappe.throw(_("Task {0} not found").format(name), frappe.DoesNotExistError)
	return task


# The Tasks Envision lists on a project, its milestones and its modules: not
# milestones, Cancelled or templates (frontend/src/lib/tasks.ts,
# useProjectTasks).
LIVE_TASKS = {
	"is_milestone": 0,
	"is_template": 0,
	"status": ["not in", ["Template", "Cancelled"]],
}


# What the Board needs of each Task (frontend/src/lib/tasks.ts, TaskSummary).
TASK_LIST_FIELDS = [
	"name",
	"subject",
	"status",
	"priority",
	"exp_start_date",
	"exp_end_date",
	"_user_tags",
	"envision_milestone",
	"envision_module",
]


@frappe.whitelist()
def list_project_tasks(project: str) -> list[dict]:
	"""A project's Tasks as the Board lists them."""
	frappe.get_doc("Project", project).check_permission("read")
	return board_tasks({"project": project})


@frappe.whitelist()
def list_my_tasks() -> list[dict]:
	"""My tasks (CONTEXT.md): the Tasks assigned to the signed-in user on every
	Envision-enabled Project they can read, as the Board lists them, each also
	with its project and the titles of its Milestone and Module.

	Assignment is read from ToDo (``ASSIGNED``), not ``_assign``, so a Done
	Task stays on My tasks.
	"""
	frappe.has_permission("Task", "read", throw=True)
	tasks = frappe.get_all(
		"ToDo",
		filters={
			"reference_type": "Task",
			"allocated_to": frappe.session.user,
			"status": ["in", ASSIGNED],
		},
		pluck="reference_name",
		distinct=True,
	)
	projects = envision_projects()
	if not tasks or not projects:
		return []
	rows = board_tasks(
		{"name": ["in", tasks], "project": ["in", list(projects)]}, [*TASK_LIST_FIELDS, "project"]
	)
	# The user can read these Tasks, so their Milestone and Module titles too.
	milestones = titles("Task", "subject", {row.envision_milestone for row in rows})
	modules = titles("Envision Module", "module_name", {row.envision_module for row in rows})
	for row in rows:
		row["project_name"] = projects[row.project]
		row["milestone_subject"] = milestones.get(row.envision_milestone)
		row["module_name"] = modules.get(row.envision_module)
	return rows


def board_tasks(filters: dict, fields: list[str] = TASK_LIST_FIELDS) -> list[dict]:
	"""Tasks as the Board lists them (``LIVE_TASKS``), through Task permissions,
	latest change first, each with everyone assigned to it (``assignees_of``),
	so a Done Task keeps its avatar and its place under an Assignee filter."""
	rows = frappe.get_list(
		"Task",
		filters={**filters, **LIVE_TASKS},
		fields=fields,
		order_by="modified desc",
		limit_page_length=500,
	)
	assigned = assignees_of([row.name for row in rows])
	for row in rows:
		row["assignees"] = assigned[row.name]
	return rows


def titles(doctype: str, field: str, names: set[str | None]) -> dict[str, str]:
	"""``field`` of each named record, in one query. Blank names are skipped."""
	names = {name for name in names if name}
	if not names:
		return {}
	return dict(
		frappe.get_all(doctype, filters={"name": ["in", list(names)]}, fields=["name", field], as_list=True)
	)


def live_task_count(filters: dict) -> int:
	"""Tasks matching ``filters`` that Envision lists (``LIVE_TASKS``)."""
	return frappe.db.count("Task", {**filters, **LIVE_TASKS})


def task_subtree(task) -> list[str]:
	"""All descendants and the Task, children before parents.

	Include Cancelled Tasks and every depth: the confirm must count everything
	that will be deleted, not just the subtasks visible on the Board.
	"""
	descendants = get_descendants_of("Task", task.name, ignore_permissions=True)
	return frappe.get_all(
		"Task",
		filters={"name": ["in", [task.name, *descendants]]},
		pluck="name",
		order_by="lft desc",
	)


@frappe.whitelist()
def count_subtasks(name: str) -> dict:
	"""How many descendant Tasks a permanent delete would remove."""
	task = task_doc(name, "delete")
	return {"subtasks": len(task_subtree(task)) - 1}


@frappe.whitelist(methods=["POST"])
def delete_task(name: str) -> dict:
	"""Permanently delete a Task and its entire subtree after confirmation.

	Require delete permission on every Task before any mutation. Internal
	dependency rows go first, then children before parents. External links
	(including other Tasks' dependencies and Timesheets) keep Frappe's normal
	delete protections: any failure rolls back the entire operation. No
	archive, grace period, or Deleted Document recovery copy is created.
	"""
	task = task_doc(name, "delete")
	tree = task_subtree(task)
	documents = [frappe.get_doc("Task", task_name) for task_name in tree]
	for doc in documents:
		doc.check_permission("delete")
	# Check every external link before deleting anything: Frappe also removes
	# attachments from disk, which a database rollback alone cannot restore.
	tree_names = set(tree)
	for doc in documents:
		for link in [*get_linked_docs(doc), *get_dynamic_linked_docs(doc)]:
			if link["reference_doctype"] == "Task" and link["reference_docname"] in tree_names:
				continue
			raise_link_exists_exception(
				doc, link["reference_doctype"], link["reference_docname"], link.get("at_position", "")
			)

	frappe.db.savepoint("delete_task_tree")
	try:
		# Only dependencies owned by the deleted tree may be removed. Never
		# silently modify a surviving Task to bypass a linked-record check.
		frappe.db.delete(
			"Task Depends On",
			{"parenttype": "Task", "parent": ["in", tree], "task": ["in", tree]},
		)
		for task_name in tree:
			frappe.delete_doc("Task", task_name, delete_permanently=True)
	except Exception:
		frappe.db.rollback(save_point="delete_task_tree")
		raise
	return {"name": task.name, "subject": task.subject, "subtasks": len(tree) - 1}


def task_detail(task) -> dict:
	return {
		"name": task.name,
		"subject": task.subject,
		"description": task.description or "",
		"status": task.status,
		"priority": task.priority,
		"start_date": as_date(task.exp_start_date),
		"due_date": as_date(task.exp_end_date),
		# The first assignee, for screens that show one, and everyone.
		"assignee": assignee_details([task.name]).get(task.name),
		"assignees": assignee_people(task.name),
		"milestone": task.get("envision_milestone") or None,
		"module": task.get("envision_module") or None,
		"tags": task_tags(task),
		"project": task.project,
		"project_name": frappe.db.get_value("Project", task.project, "project_name")
		if task.project
		else None,
		"owner": task.owner,
		"creation": timestamp(task.creation),
		"modified": timestamp(task.modified),
		# Read-only viewers see the page without Save or the editor.
		"can_write": bool(task.has_permission("write")),
		"can_delete": bool(task.has_permission("delete")),
	}


@frappe.whitelist()
def list_tags() -> dict:
	"""Every Frappe tag on the site, for the Tags picker. Tags are site-wide.

	``can_delete`` is whether this user may delete a tag everywhere (03e),
	which Frappe gives System Managers only.
	"""
	return {
		"tags": frappe.get_list("Tag", pluck="name", order_by="name asc", limit_page_length=0),
		"can_delete": bool(frappe.has_permission("Tag", "delete")),
	}


@frappe.whitelist()
def get_tag_usage(tag: str) -> dict:
	"""Where a tag is, for the confirm before deleting it everywhere (03f)."""
	frappe.has_permission("Tag", "delete", throw=True)
	documents = tagged_documents(tag)
	tasks = [name for doctype, name in documents if doctype == "Task"]
	projects = (
		frappe.get_all("Task", filters={"name": ["in", tasks]}, pluck="project", distinct=True)
		if tasks
		else []
	)
	return {
		"tasks": len(tasks),
		# A count, not names: the confirm says how much, not where.
		"projects": len([project for project in projects if project]),
		# Tags are site-wide: Desk can put the same one on any document.
		"others": len(documents) - len(tasks),
	}


@frappe.whitelist(methods=["POST"])
def delete_tag(tag: str) -> dict:
	"""Delete a tag everywhere (03f): off every document, then the Tag itself.

	Deleting a Tag leaves documents' ``_user_tags`` and Tag Links behind, and a
	Tag Link would block the delete, so both go first. The permission checked
	is the Tag's, not each document's: a tag belongs to the whole site.
	"""
	frappe.has_permission("Tag", "delete", throw=True)
	documents = tagged_documents(tag)
	key = tag.casefold()
	for doctype, name in documents:
		value = frappe.db.get_value(doctype, name, "_user_tags") or ""
		kept = [t for t in value.split(",") if t and t.casefold() != key]
		frappe.db.set_value(doctype, name, "_user_tags", ",".join(kept), update_modified=False)
	frappe.db.delete("Tag Link", {"tag": tag})
	if frappe.db.exists("Tag", tag):
		frappe.delete_doc("Tag", tag)
	return {"tasks": sum(1 for doctype, _name in documents if doctype == "Task")}


def tagged_documents(tag: str) -> list[tuple[str, str]]:
	"""Every document with ``tag``, as (doctype, name).

	Tag Links index the tags Desk added. Tasks are also read from their own
	``_user_tags``, which is what the Board shows, in case a tag there has no
	Tag Link.
	"""
	key = tag.casefold()
	documents = {
		(link.document_type, link.document_name)
		for link in frappe.get_all(
			"Tag Link", filters={"tag": tag}, fields=["document_type", "document_name"]
		)
	}
	# LIKE narrows the rows; the exact match is on the comma-separated tags.
	for task in frappe.get_all(
		"Task", filters={"_user_tags": ["like", f"%{tag}%"]}, fields=["name", "_user_tags"]
	):
		if key in {t.casefold() for t in (task._user_tags or "").split(",")}:
			documents.add(("Task", task.name))
	return sorted(documents)


def rename_tag(doc, method, old: str, new: str, merge: bool) -> None:
	"""Tag ``after_rename``: carry a renamed (or merged) tag to where it is used.

	Frappe's rename updates Tag Links, which are Link fields, but not each
	document's ``_user_tags``, which the Board, Task page and tag filter read,
	nor the tag filters saved in Custom Views.
	"""
	retag_documents(old, new)
	rename_filter_value("tag", old, new)


def retag_documents(old: str, new: str) -> None:
	"""Swap ``old`` for ``new`` in every document's ``_user_tags``.

	By ``after_rename`` the Tag Links already point at ``new``, so they only
	say which doctypes to search; the old name is found in ``_user_tags``. The
	other tags keep their place, and a leading comma stays.
	"""
	keys = {old.casefold(), new.casefold()}
	doctypes = set(frappe.get_all("Tag Link", filters={"tag": new}, pluck="document_type", distinct=True))
	doctypes.add("Task")
	for doctype in sorted(doctypes):
		# Frappe adds ``_user_tags`` only once a doctype is first tagged, and a
		# stale Tag Link can outlive its doctype's table; neither has tags.
		if not frappe.db.table_exists(doctype) or not frappe.db.has_column(doctype, "_user_tags"):
			continue
		# LIKE narrows the rows; the exact match is on the comma-separated tags.
		for row in frappe.get_all(
			doctype, filters={"_user_tags": ["like", f"%{old}%"]}, fields=["name", "_user_tags"]
		):
			value = row._user_tags or ""
			tags, placed = [], False
			for tag in value.split(","):
				if tag.casefold() not in keys:
					tags.append(tag)
				elif not placed:
					# A merge, or a document that had both, keeps one ``new``.
					tags.append(new)
					placed = True
			retagged = ",".join(tags)
			if retagged != value:
				frappe.db.set_value(doctype, row.name, "_user_tags", retagged, update_modified=False)


def clean_tags(tags: list[str] | str | None) -> list[str]:
	"""Trimmed, without blanks or repeats, in the order they were picked."""
	values = frappe.parse_json(tags) if isinstance(tags, str) else tags
	seen: dict[str, None] = {}
	for tag in values or []:
		tag = str(tag).strip()
		if tag and tag.casefold() not in {t.casefold() for t in seen}:
			seen[tag] = None
	return list(seen)
