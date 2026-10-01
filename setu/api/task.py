import frappe
from frappe import _
from frappe.desk.form.assign_to import add as assign_to
from frappe.utils import add_days, get_datetime, getdate, now_datetime, today
from frappe.utils.nestedset import get_descendants_of

from setu.api.milestone import as_date, first_assignee, replace_assignee
from setu.api.timeline import comment_on, document_activity, people_details, timestamp

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

# An Archived Task is deleted for good this many days after it was archived
# (CONTEXT.md, Archived Task).
ARCHIVE_RETENTION_DAYS = 30


class TaskArchivedError(frappe.ValidationError):
	"""The Task is archived: Envision shows it only under Archived."""


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
) -> dict:
	"""Create a Task on a project (Paper: 03 — Create Task).

	- Opened from a Board column's "+", so the status is that column's.
	- The description arrives as HTML from Envision's rich text editor; Frappe
	  sanitizes it on save like any Text Editor value.
	- The assignee becomes a standard Frappe assignment and the tags standard
	  Frappe document tags, so Desk, notifications and filters all see them.
	- POST only: the method writes, and Frappe commits after a successful POST.
	"""
	frappe.get_doc("Project", project).check_permission("read")

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
	if assignee:
		assign_to(
			{
				"doctype": "Task",
				"name": task.name,
				"assign_to": [assignee],
				"description": subject,
			}
		)

	return {"name": task.name, "subject": task.subject, "status": task.status}


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
) -> dict:
	"""Save what changed on the Task (09: one "Save changes" for all).

	As on a milestone, ``None`` (not sent) leaves a field as it is and ``""``
	clears it, so an edit here never overwrites what someone changed in Desk
	meanwhile. Saved through the Task document, so ERPNext's validation, the
	Milestone and Module checks (validate_task_links), Frappe's write
	permission check and its HTML sanitising all run as they do in Desk. It is
	all one request, so if any part fails Frappe rolls back the rest.
	"""
	task = task_doc(name, "write")

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
	if assignee is not None:
		replace_assignee(task, assignee)
	if tags is not None or assignee is not None:
		task.reload()
	return task_detail(task)


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
def add_task_comment(name: str, content: str) -> dict:
	"""Comment on a Task (09: "Comment"), as Desk's timeline does."""
	return comment_on(task_doc(name, "read"), content)


def task_doc(name: str, ptype: str = "read", archived: bool = False):
	"""A Task the Board shows, after the permission check.

	Milestones have a page of their own and templates are not project work, so
	both are reported as missing and this page never opens or changes one. An
	archived Task is refused too, unless ``archived`` asks for one, so it is
	neither shown nor edited until it is restored.
	"""
	task = frappe.get_doc("Task", name)
	task.check_permission(ptype)
	if task.is_milestone or task.is_template:
		frappe.throw(_("Task {0} not found").format(name), frappe.DoesNotExistError)
	if bool(task.get("envision_archived_on")) != archived:
		if archived:
			frappe.throw(_("{0} is not archived.").format(frappe.bold(task.subject)))
		frappe.throw(
			_("{0} is archived. Restore it from Archived to open it.").format(frappe.bold(task.subject)),
			TaskArchivedError,
		)
	return task


def live_task_count(filters: dict) -> int:
	"""Tasks matching ``filters`` that Envision lists: neither Cancelled,
	which it hides, nor archived."""
	return frappe.db.count(
		"Task",
		{
			**filters,
			"status": ["!=", "Cancelled"],
			"is_template": 0,
			"envision_archived_on": ["is", "not set"],
		},
	)


def subtasks_to_archive(task) -> list[str]:
	"""The Task's subtasks, at any depth, that archiving it would take: those
	not already archived on their own, which keep their own thirty days."""
	descendants = get_descendants_of("Task", task.name, ignore_permissions=True)
	if not descendants:
		return []
	return frappe.get_all(
		"Task",
		filters={"name": ["in", descendants], "envision_archived_on": ["is", "not set"]},
		pluck="name",
	)


def visible_subtasks(names: list[str]) -> int:
	"""How many of these subtasks Envision would list; Cancelled ones are hidden."""
	if not names:
		return 0
	return frappe.db.count("Task", {"name": ["in", names], "status": ["!=", "Cancelled"]})


@frappe.whitelist()
def count_subtasks(name: str) -> dict:
	"""How many subtasks archiving the Task takes with it (Paper: Task Archive 02)."""
	task = task_doc(name)
	return {"subtasks": visible_subtasks(subtasks_to_archive(task))}


@frappe.whitelist(methods=["POST"])
def archive_task(name: str) -> dict:
	"""Archive a Task and its subtree (Paper: "Archive task journey").

	Nothing is deleted yet: each Task in the tree is marked with when and by
	whom, and its subtasks with the Task they went with, so a restore brings
	the tree back together. Envision hides them all, and
	``delete_expired_archives`` deletes them after thirty days. The marks are
	written without touching ``modified``, so a restored Task keeps its place
	on the Board. Anyone who can edit the Task may archive it.
	"""
	task = task_doc(name, "write")
	subtasks = subtasks_to_archive(task)
	visible = visible_subtasks(subtasks)
	values = {"envision_archived_on": now_datetime(), "envision_archived_by": frappe.session.user}
	frappe.db.set_value("Task", task.name, {**values, "envision_archived_with": None}, update_modified=False)
	if subtasks:
		frappe.db.set_value(
			"Task",
			{"name": ["in", subtasks]},
			{**values, "envision_archived_with": task.name},
			update_modified=False,
		)
	task.add_comment("Info", _("archived this task"))
	return {"name": task.name, "subject": task.subject, "subtasks": visible}


@frappe.whitelist(methods=["POST"])
def restore_task(name: str) -> dict:
	"""Bring an archived Task and the subtasks it took back (Paper: Task
	Archive 04, and the Undo after archiving). A subtask that went with its
	parent comes back with that parent, not on its own."""
	task = task_doc(name, "write", archived=True)
	if task.get("envision_archived_with"):
		parent = frappe.db.get_value("Task", task.envision_archived_with, "subject")
		frappe.throw(
			_("{0} was archived with {1}. Restore that task instead.").format(
				frappe.bold(task.subject), frappe.bold(parent or task.envision_archived_with)
			)
		)
	subtasks = frappe.get_all("Task", filters={"envision_archived_with": task.name}, pluck="name")
	cleared = {"envision_archived_on": None, "envision_archived_by": None, "envision_archived_with": None}
	frappe.db.set_value("Task", {"name": ["in", [task.name, *subtasks]]}, cleared, update_modified=False)
	task.add_comment("Info", _("restored this task"))
	return {"name": task.name, "subject": task.subject, "subtasks": visible_subtasks(subtasks)}


@frappe.whitelist()
def list_archived_tasks(project: str) -> list[dict]:
	"""A project's archived Tasks, newest first (Paper: Task Archive 04).

	Only the Tasks someone archived are listed; the subtasks that went with
	one are counted on its row, since they come back with it.
	"""
	frappe.get_doc("Project", project).check_permission("read")
	rows = frappe.get_list(
		"Task",
		filters={
			"project": project,
			"is_milestone": 0,
			"is_template": 0,
			"envision_archived_on": ["is", "set"],
			"envision_archived_with": ["is", "not set"],
		},
		fields=["name", "subject", "status", "envision_archived_on", "envision_archived_by"],
		order_by="envision_archived_on desc",
		limit_page_length=0,
	)
	subtasks: dict[str, int] = {}
	if rows:
		for root in frappe.get_all(
			"Task",
			filters={
				"envision_archived_with": ["in", [row.name for row in rows]],
				"status": ["!=", "Cancelled"],
			},
			pluck="envision_archived_with",
		):
			subtasks[root] = subtasks.get(root, 0) + 1
	people = people_details({row.envision_archived_by for row in rows if row.envision_archived_by})
	return [
		{
			"name": row.name,
			"subject": row.subject,
			"status": row.status,
			"subtasks": subtasks.get(row.name, 0),
			"archived_on": timestamp(row.envision_archived_on),
			"archived_by": people.get(row.envision_archived_by or ""),
			"deletes_on": timestamp(add_days(get_datetime(row.envision_archived_on), ARCHIVE_RETENTION_DAYS)),
		}
		for row in rows
	]


def delete_expired_archives() -> None:
	"""Delete every Task archived more than thirty days ago, with the subtasks
	that went with it (scheduler_events, daily).

	Subtasks go before their parents, since ERPNext refuses to delete a Task
	that still has children, and dependency rows naming the tree go first, as
	they would block it as linked records. Each tree is its own attempt: one
	that cannot be deleted (say, a Timesheet logs time against it) is logged
	and tried again the next day, and the rest still go.
	"""
	cutoff = add_days(now_datetime(), -ARCHIVE_RETENTION_DAYS)
	roots = frappe.get_all(
		"Task",
		filters={
			"envision_archived_on": ["<", cutoff],
			"envision_archived_with": ["is", "not set"],
		},
		pluck="name",
	)
	for root in roots:
		frappe.db.savepoint("archived_tree")
		try:
			subtasks = frappe.get_all("Task", filters={"envision_archived_with": root}, pluck="name")
			# Deepest first, so no Task is deleted while it still has children.
			tree = frappe.get_all(
				"Task", filters={"name": ["in", [root, *subtasks]]}, pluck="name", order_by="lft desc"
			)
			frappe.db.delete("Task Depends On", {"task": ["in", tree]})
			for name in tree:
				frappe.delete_doc("Task", name, ignore_permissions=True)
		except Exception:
			frappe.db.rollback(save_point="archived_tree")
			frappe.log_error(title=f"Could not delete archived Task {root}")


def task_detail(task) -> dict:
	assignee = first_assignee(task.get("_assign"))
	return {
		"name": task.name,
		"subject": task.subject,
		"description": task.description or "",
		"status": task.status,
		"priority": task.priority,
		"start_date": as_date(task.exp_start_date),
		"due_date": as_date(task.exp_end_date),
		"assignee": people_details({assignee}).get(assignee) if assignee else None,
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


def clean_tags(tags: list[str] | str | None) -> list[str]:
	"""Trimmed, without blanks or repeats, in the order they were picked."""
	values = frappe.parse_json(tags) if isinstance(tags, str) else tags
	seen: dict[str, None] = {}
	for tag in values or []:
		tag = str(tag).strip()
		if tag and tag.casefold() not in {t.casefold() for t in seen}:
			seen[tag] = None
	return list(seen)
