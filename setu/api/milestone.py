import frappe
from frappe import _
from frappe.desk.form.assign_to import add as assign_to
from frappe.desk.form.assign_to import remove as remove_assignment
from frappe.utils import getdate

from setu.api.timeline import comment_on, document_activity, people_details, timestamp

# A milestone is an ERPNext Task on the project with Is Milestone checked, not a
# record type of its own (docs/adr/0001): Desk, Gantt and every existing report
# keep working, and a task can later point at one. The Envision screens never
# offer "create milestone" from the task form, so this module is the only way
# one is made (Paper: "Create milestone journey").

MILESTONE_FIELDS = [
	"name",
	"subject",
	"description",
	"exp_start_date",
	"exp_end_date",
	"status",
]


@frappe.whitelist()
def list_milestones(project: str) -> list[dict]:
	"""A project's milestones, by due date (Paper: 06 — Empty Milestones)."""
	frappe.get_doc("Project", project).check_permission("read")
	rows = frappe.get_list(
		"Task",
		filters={"project": project, "is_milestone": 1},
		fields=MILESTONE_FIELDS,
		order_by="exp_end_date asc, creation asc",
		limit_page_length=0,
	)
	names = [row.name for row in rows]
	assignees = assignee_details(names)
	counts = linked_task_counts(names)
	return [milestone_summary(row, assignees.get(row.name), counts[row.name]) for row in rows]


@frappe.whitelist()
def list_milestone_options() -> list[dict]:
	"""Every milestone on the Envision-enabled Projects the user can read, for
	My tasks' Milestone filter: by project, then due date. Titles only; the
	progress counts are the milestone page's."""
	projects = envision_projects()
	if not projects:
		return []
	rows = frappe.get_list(
		"Task",
		filters={"project": ["in", list(projects)], "is_milestone": 1},
		fields=["name", "subject", "project"],
		order_by="exp_end_date asc, creation asc",
		limit_page_length=0,
	)
	options = [
		{
			"name": row.name,
			"subject": row.subject,
			"project": row.project,
			"project_name": projects[row.project],
		}
		for row in rows
	]
	# Stable, so each project's milestones keep their due-date order.
	options.sort(key=lambda option: (option["project_name"] or "").casefold())
	return options


def envision_projects() -> dict[str, str]:
	"""Title of each Envision-enabled Project (CONTEXT.md) the user can read,
	open or not, by name. My tasks spans all of them."""
	return dict(
		frappe.get_list(
			"Project",
			filters={"envision_enabled": 1},
			fields=["name", "project_name"],
			limit_page_length=0,
			as_list=True,
		)
	)


@frappe.whitelist()
def get_milestone(name: str) -> dict:
	"""One milestone and its project's title (Paper: 06d — Milestone Detail)."""
	return milestone_detail(milestone_doc(name))


@frappe.whitelist(methods=["POST"])
def update_milestone(
	name: str,
	subject: str | None = None,
	description: str | None = None,
	start_date: str | None = None,
	due_date: str | None = None,
	assignee: str | None = None,
) -> dict:
	"""Save what changed on the milestone (06d: one "Save changes" for all).

	Only the fields that were sent change: ``None`` (not sent) leaves a field
	as it is, and ``""`` clears it, so an edit here never overwrites what
	someone else changed in Desk meanwhile. Saved through the Task document,
	so ERPNext's validation (e.g. no date past the project's end), Frappe's
	write permission check and its HTML sanitising all run as they do in Desk.
	It is all one request, so if any part fails Frappe rolls back the rest.
	"""
	task = milestone_doc(name, "write")

	if subject is not None:
		subject = subject.strip()
		if not subject:
			frappe.throw(_("Milestone title is required"), frappe.MandatoryError)
		task.subject = subject
	if description is not None:
		task.description = description.strip()
	if start_date is not None:
		task.exp_start_date = start_date or None
	if due_date is not None:
		if not due_date:
			frappe.throw(_("Due date is required"), frappe.MandatoryError)
		task.exp_end_date = due_date
	# As on create: ERPNext refuses this too, but with a message about
	# expected dates.
	if (
		task.exp_start_date
		and task.exp_end_date
		and getdate(task.exp_start_date) > getdate(task.exp_end_date)
	):
		frappe.throw(_("Start date cannot be after the due date."), frappe.exceptions.InvalidDates)

	if any(value is not None for value in (subject, description, start_date, due_date)):
		task.save()
	if assignee is not None:
		replace_assignee(task, assignee)
		task.reload()
	return milestone_detail(task)


def replace_assignee(task, assignee: str) -> None:
	"""Make ``assignee`` the milestone's assignee, or nobody for ``""``.

	Through Frappe's assignment API, as Desk's "Assign To" does, so the ToDo,
	``_assign``, notifications and the timeline's "assigned" line all follow.
	The screens show one assignee, so only that one is replaced; anyone else
	assigned from Desk keeps their assignment. The new person is added before
	the old one is removed, so a refused assignment (document sharing off and
	no access) leaves the old one in place.
	"""
	assigned = assignees_of([task.name])[task.name]
	current = assigned[0] if assigned else None
	if assignee == (current or ""):
		return
	if assignee and assignee not in assigned:
		assign_to(
			{
				"doctype": "Task",
				"name": task.name,
				"assign_to": [assignee],
				"description": task.subject,
			}
		)
	if current:
		remove_assignment("Task", task.name, current)


@frappe.whitelist()
def get_milestone_activity(name: str) -> dict:
	"""The milestone's timeline (06d: "Activity (Frappe form timeline)")."""
	return document_activity(milestone_doc(name))


@frappe.whitelist(methods=["POST"])
def add_milestone_comment(name: str, content: str) -> dict:
	"""Comment on a milestone (06d: "Comment"), as Desk's timeline does."""
	return comment_on(milestone_doc(name, "read"), content)


@frappe.whitelist()
def count_linked_tasks(name: str) -> dict:
	"""How many Tasks a delete would leave with no milestone (Paper: Milestone
	Delete 02). Counted as the milestone page lists them (``LIVE_TASKS``)."""
	from setu.api.task import live_task_count

	milestone_doc(name)
	return {"tasks": live_task_count({"envision_milestone": name})}


@frappe.whitelist(methods=["POST"])
def delete_milestone(name: str) -> dict:
	"""Delete a milestone for good (Paper: "Delete milestone journey").

	Its Tasks stay, with no milestone: the link is cleared on every one of
	them first, since a Task pointing at a deleted
	milestone would also block the delete as a linked record. The link is
	cleared without touching ``modified``, so the Board's order holds. Frappe's
	own delete then checks the Task delete permission and removes the
	milestone's comments and assignments with it.
	"""
	from setu.api.task import live_task_count

	task = milestone_doc(name, "delete")
	tasks = live_task_count({"envision_milestone": name})
	frappe.db.set_value(
		"Task", {"envision_milestone": name}, "envision_milestone", None, update_modified=False
	)
	frappe.delete_doc("Task", name)
	return {"name": name, "subject": task.subject, "tasks": tasks}


def milestone_doc(name: str, ptype: str = "read"):
	"""The Task behind a milestone, after the permission check.

	A Task that is not a milestone is reported as missing, so the milestone
	screen never opens or changes an ordinary task.
	"""
	task = frappe.get_doc("Task", name)
	task.check_permission(ptype)
	if not task.is_milestone:
		frappe.throw(_("Milestone {0} not found").format(name), frappe.DoesNotExistError)
	return task


def milestone_detail(task) -> dict:
	return {
		**milestone_summary(
			task.as_dict(),
			assignee_details([task.name]).get(task.name),
			linked_task_counts([task.name])[task.name],
		),
		"project": task.project,
		"project_name": frappe.db.get_value("Project", task.project, "project_name")
		if task.project
		else None,
		"owner": task.owner,
		"creation": timestamp(task.creation),
		"modified": timestamp(task.modified),
		# Read-only viewers see the screen without Save or the editor.
		"can_write": bool(task.has_permission("write")),
	}


@frappe.whitelist(methods=["POST"])
def create_milestone(
	project: str,
	subject: str,
	description: str | None = None,
	start_date: str | None = None,
	due_date: str | None = None,
	assignee: str | None = None,
) -> dict:
	"""Create a milestone on a project (Paper: 06a — Create Milestone).

	- The description arrives as HTML from Envision's rich text editor and is
	  stored in the Task's ``description``, which Frappe sanitizes on save like
	  any Text Editor value.
	- The assignee becomes a standard Frappe assignment (the ToDo behind
	  ``_assign``), so Desk, notifications and "assigned to me" all see it.
	- POST only: the method writes, and Frappe commits after a successful POST.
	"""
	frappe.get_doc("Project", project).check_permission("read")

	subject = (subject or "").strip()
	if not subject:
		frappe.throw(_("Milestone title is required"), frappe.MandatoryError)
	if not due_date:
		frappe.throw(_("Due date is required"), frappe.MandatoryError)
	# ERPNext refuses this too, but with a message about expected dates.
	if start_date and getdate(start_date) > getdate(due_date):
		frappe.throw(_("Start date cannot be after the due date."), frappe.exceptions.InvalidDates)

	task = frappe.new_doc("Task")
	task.project = project
	task.subject = subject
	task.is_milestone = 1
	task.description = (description or "").strip()
	task.exp_start_date = start_date or None
	task.exp_end_date = due_date
	task.insert()

	if assignee:
		assign_to(
			{
				"doctype": "Task",
				"name": task.name,
				"assign_to": [assignee],
				"description": subject,
			}
		)
		task.reload()

	# A new milestone has no Tasks yet.
	return milestone_summary(task.as_dict(), assignee_details([task.name]).get(task.name), (0, 0))


def linked_task_counts(milestones: list[str]) -> dict[str, tuple[int, int]]:
	"""Done and total Tasks linked to each milestone, in one query.

	A milestone's progress comes from its Tasks (Paper 06d: "Status updates
	itself as linked tasks move to Done"), not ERPNext's ``progress``, which
	nothing here sets. Counted as the milestone page lists them
	(``LIVE_TASKS``), Completed being done, and only the Tasks the user can
	read, so the list and the milestone page agree for everyone.
	"""
	from setu.api.task import LIVE_TASKS

	counts = dict.fromkeys(milestones, (0, 0))
	if not milestones:
		return counts
	rows = frappe.get_list(
		"Task",
		filters={**LIVE_TASKS, "envision_milestone": ["in", milestones]},
		fields=["envision_milestone", "status", {"COUNT": "*", "as": "tasks"}],
		group_by="envision_milestone, status",
		limit_page_length=0,
	)
	for row in rows:
		done, total = counts[row.envision_milestone]
		completed = row.tasks if row.status == "Completed" else 0
		counts[row.envision_milestone] = (done + completed, total + row.tasks)
	return counts


def milestone_summary(row: dict, assignee: dict | None, tasks: tuple[int, int]) -> dict:
	done, total = tasks
	return {
		"name": row["name"],
		"subject": row["subject"],
		"description": row.get("description") or "",
		"start_date": as_date(row.get("exp_start_date")),
		"due_date": as_date(row.get("exp_end_date")),
		"status": row.get("status") or "Open",
		"progress": done / total * 100 if total else 0,
		"done_tasks": done,
		"total_tasks": total,
		"assignee": assignee,
	}


# Who is assigned to a Task comes from Frappe's ToDo records, not ``_assign``.
# Frappe keeps ``_assign`` to the Open assignments, and ERPNext closes every
# assignment of a Task as it is Completed, so ``_assign`` forgets who did a
# Done Task. Closed still means assigned; Cancelled is how Frappe unassigns.
ASSIGNED = ("Open", "Closed")


def assignees_of(tasks: list[str]) -> dict[str, list[str]]:
	"""Everyone assigned to each Task, first assigned first, in one query.

	Read without permission checks: callers pass Tasks the user can read.
	"""
	assigned: dict[str, list[str]] = {task: [] for task in tasks}
	if not tasks:
		return assigned
	rows = frappe.get_all(
		"ToDo",
		filters={
			"reference_type": "Task",
			"reference_name": ["in", tasks],
			"status": ["in", ASSIGNED],
			"allocated_to": ["is", "set"],
		},
		fields=["reference_name", "allocated_to"],
		order_by="creation asc",
	)
	for row in rows:
		users = assigned[row.reference_name]
		if row.allocated_to not in users:
			users.append(row.allocated_to)
	return assigned


def assignee_details(tasks: list[str]) -> dict[str, dict]:
	"""Name and avatar of each Task's assignee (the screens show one), in one
	query for the people. Tasks with nobody assigned are left out."""
	first = {task: users[0] for task, users in assignees_of(tasks).items() if users}
	people = people_details(set(first.values()))
	return {task: people[user] for task, user in first.items() if user in people}


def as_date(value) -> str | None:
	"""Expected start and end are Datetime on Task; the screens show days."""
	return getdate(value).isoformat() if value else None
