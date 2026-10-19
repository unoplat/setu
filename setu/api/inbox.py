import html
from datetime import datetime
from typing import Literal, TypedDict

import frappe
from frappe import _
from frappe.query_builder import Case, DocType, Order
from frappe.query_builder.functions import Coalesce, Count, Max, Sum
from frappe.utils import strip_html
from pypika.queries import QueryBuilder

from setu.api.timeline import people_details, timestamp

# Envision's Inbox (Paper: 10 — Inbox, 10b — Inbox: Empty): the Notification
# Log rows Frappe already writes for the session user, on Envision records
# only. Assigning someone (Frappe's assign_to), removing an assignment and
# @mentioning someone in a comment each write one; nothing here writes them.
#
# - Board Message is left out until it has a page of its own to open.
# - A Task (milestones included) or a Project counts only on an
#   Envision-enabled Project; Envision Modules and Links always are.
# - The scope is applied in SQL, so pages and the counts stay exact.
# - The list shows every row, but the counts are of records: three unread
#   rows on one Task are one thing to open.
# - Opening a record marks its rows read (mark_record_read), as Gameplan's
#   track_visit does; mark_all_read clears the Inbox, and only the Inbox.

INBOX_DOCTYPES = ("Task", "Project", "Envision Module", "Envision Link")
ALWAYS_ENVISION = ("Envision Module", "Envision Link")

# Rows per page are capped, as a whitelisted method takes any number.
MAX_PAGE_LENGTH = 100

# The realtime event other tabs refresh their counts on.
INBOX_EVENT = "envision_inbox"

InboxRecordKind = Literal["task", "milestone", "module", "link", "project"]

# The Inbox's filter chips (Paper: 10c): every row, or one type's.
InboxFilter = Literal["all", "assigned", "mentions"]

FILTER_TYPES: dict[InboxFilter, str] = {"assigned": "Assignment", "mentions": "Mention"}

RECORD_KINDS: dict[str, InboxRecordKind] = {
	"Envision Module": "module",
	"Envision Link": "link",
	"Project": "project",
}

LOG = DocType("Notification Log")
TASK = DocType("Task")
MODULE = DocType("Envision Module")
LINK = DocType("Envision Link")
PROJECT = DocType("Project")


class InboxPerson(TypedDict):
	name: str
	full_name: str | None
	user_image: str | None


class InboxRecord(TypedDict):
	kind: InboxRecordKind
	name: str
	# None once the record is gone: the row shows, without a link.
	title: str | None
	project: str | None
	project_title: str | None
	# The Task's status as it is now, for tasks and milestones only.
	status: str | None


class InboxItem(TypedDict):
	name: str
	type: str
	read: bool
	creation: str
	summary: str
	# What a mention said, as plain text; None for anything else.
	excerpt: str | None
	actor: InboxPerson | None
	record: InboxRecord


class InboxPage(TypedDict):
	items: list[InboxItem]
	has_more: bool


class InboxCounts(TypedDict):
	# Records with anything unread (the sidebar badge).
	unread: int
	# Records with an unread assignment, and with an unread mention.
	assigned: int
	mentions: int


class InboxRow(TypedDict):
	name: str
	type: str
	read: int
	creation: datetime
	subject: str | None
	email_content: str | None
	from_user: str | None
	document_type: str
	document_name: str
	is_milestone: int | None
	task_title: str | None
	task_status: str | None
	module_title: str | None
	link_title: str | None
	project: str | None
	project_title: str | None


@frappe.whitelist()
def list_inbox(
	start: int = 0,
	limit: int = 30,
	filter: InboxFilter = "all",
	unread_only: bool = False,
	project: str | None = None,
) -> InboxPage:
	"""The session user's Inbox, unread first, then newest first, one page at
	a time.

	- Unread rows lead every page that has them, so the page's Unread and
	  Earlier sections never interleave as "Load more" adds rows.
	- ``filter``, ``unread_only`` and ``project`` narrow the rows in SQL,
	  so pages stay full and ``has_more`` exact.
	- ``has_more`` says whether "Load more" has anything left to show: one
	  row past the page is read to tell.
	"""
	start = max(start, 0)
	limit = min(max(limit, 1), MAX_PAGE_LENGTH)
	query = inbox_query(project)
	if filter != "all":
		query = query.where(LOG.type == FILTER_TYPES[filter])
	if unread_only:
		query = query.where(LOG.read == 0)
	rows: list[InboxRow] = (
		query.select(
			LOG.name,
			LOG.type,
			LOG.read,
			LOG.creation,
			LOG.subject,
			LOG.email_content,
			LOG.from_user,
			LOG.document_type,
			LOG.document_name,
			TASK.is_milestone,
			TASK.subject.as_("task_title"),
			TASK.status.as_("task_status"),
			MODULE.module_name.as_("module_title"),
			LINK.link_name.as_("link_title"),
			PROJECT.name.as_("project"),
			PROJECT.project_name.as_("project_title"),
		)
		.orderby(LOG.read, order=Order.asc)
		.orderby(LOG.creation, order=Order.desc)
		.limit(limit + 1)
		.offset(start)
		.run(as_dict=True)
	)
	page = rows[:limit]
	actors = {user for user in (row["from_user"] for row in page) if user is not None}
	people = {name: inbox_person(user) for name, user in people_details(actors).items()}
	return {
		"items": [inbox_item(row, people) for row in page],
		"has_more": len(rows) > limit,
	}


@frappe.whitelist()
def inbox_counts(project: str | None = None) -> InboxCounts:
	"""How many records the session user has unread Inbox items on: all of
	them (the sidebar badge), and those with an unread assignment or mention.
	With ``project``, only that Project's (the page's chips, under its
	project filter).

	One query: the unread rows are grouped by record first, each group
	flagged for what it holds, then the groups are counted. A record counts
	once however many of its rows are unread. ``COUNT(DISTINCT a, b)`` would
	say the same in one step, but only MariaDB takes it; this runs on
	Postgres too.
	"""
	records = (
		inbox_query(project)
		.select(
			Max(Case().when(LOG.type == "Assignment", 1).else_(0)).as_("assigned"),
			Max(Case().when(LOG.type == "Mention", 1).else_(0)).as_("mentions"),
		)
		.where(LOG.read == 0)
		.groupby(LOG.document_type, LOG.document_name)
		.as_("records")
	)
	# SUM comes back a float on MariaDB (Frappe reads DECIMAL as float), and
	# NULL with no records, hence the COALESCE and the int().
	rows: list[tuple[int, float, float]] = (
		frappe.qb.from_(records)
		.select(
			Count("*"),
			Coalesce(Sum(records.assigned), 0),
			Coalesce(Sum(records.mentions), 0),
		)
		.run()
	)
	unread, assigned, mentions = rows[0]
	return {"unread": unread, "assigned": int(assigned), "mentions": int(mentions)}


@frappe.whitelist(methods=["POST"])
def mark_record_read(document_type: str, document_name: str) -> InboxCounts:
	"""Mark the session user's Inbox items on one record read, as its page
	opens, and return the counts left.

	One update for every row, as Frappe's own ``mark_all_as_read``, with
	``modified`` left as it was. When anything changed, the user's other tabs
	are told the new counts after the commit.
	"""
	if document_type not in INBOX_DOCTYPES:
		frappe.throw(_("The Inbox has no items on {0}").format(document_type), frappe.ValidationError)
	user = frappe.session.user
	filters = {
		"for_user": user,
		"document_type": document_type,
		"document_name": document_name,
		"read": 0,
	}
	# A read-only request (e.g. during maintenance) cannot write.
	if frappe.flags.read_only or not frappe.db.exists("Notification Log", filters):
		return inbox_counts()
	frappe.db.set_value("Notification Log", filters, "read", 1, update_modified=False)
	counts = inbox_counts()
	frappe.publish_realtime(INBOX_EVENT, dict(counts), user=user, after_commit=True)
	return counts


@frappe.whitelist(methods=["POST"])
def mark_all_read(project: str | None = None) -> InboxCounts:
	"""Mark every Inbox item the session user has not opened read, or only
	``project``'s (the page's project filter), and return the counts left
	under the same scope.

	Frappe's own ``mark_all_as_read`` would clear the user's notifications
	from other apps too. The Inbox's scope lives in its joins, so its unread
	rows are picked first, then updated by name, with ``modified`` left as it
	was, as ``mark_record_read`` does.
	"""
	user = frappe.session.user
	names: list[str] = inbox_query(project).select(LOG.name).where(LOG.read == 0).run(pluck=True)
	# A read-only request (e.g. during maintenance) cannot write.
	if frappe.flags.read_only or not names:
		return inbox_counts(project)
	frappe.db.set_value(
		"Notification Log",
		{"name": ("in", names), "for_user": user, "read": 0},
		"read",
		1,
		update_modified=False,
	)
	# The other tabs are told the badge's counts, every project's.
	frappe.publish_realtime(INBOX_EVENT, dict(inbox_counts()), user=user, after_commit=True)
	return inbox_counts(project)


def inbox_query(project: str | None = None) -> QueryBuilder:
	"""The session user's Notification Log rows on Envision records, joined to
	the record and its Project for the scope and the titles; with
	``project``, that Project's only.

	The user is filtered explicitly: Notification Log's permission query
	limits rows to ``for_user``, but the query builder does not apply it and
	Administrator would bypass it anyway.
	"""
	query = (
		frappe.qb.from_(LOG)
		.left_join(TASK)
		.on((LOG.document_type == "Task") & (TASK.name == LOG.document_name))
		.left_join(MODULE)
		.on((LOG.document_type == "Envision Module") & (MODULE.name == LOG.document_name))
		.left_join(LINK)
		.on((LOG.document_type == "Envision Link") & (LINK.name == LOG.document_name))
		.left_join(PROJECT)
		.on(
			PROJECT.name
			== Coalesce(
				TASK.project,
				MODULE.project,
				LINK.project,
				Case().when(LOG.document_type == "Project", LOG.document_name),
			)
		)
		.where(LOG.for_user == frappe.session.user)
		.where(LOG.document_type.isin(INBOX_DOCTYPES))
		.where(LOG.document_type.isin(ALWAYS_ENVISION) | (PROJECT.envision_enabled == 1))
	)
	if project:
		query = query.where(PROJECT.name == project)
	return query


def inbox_item(row: InboxRow, people: dict[str, InboxPerson]) -> InboxItem:
	"""One Inbox row as the page shows it.

	The summary is Frappe's own subject ("Aarav assigned a new task …"),
	already translated, as plain text: its markup is only bold names.
	"""
	return {
		"name": row["name"],
		"type": row["type"],
		"read": bool(row["read"]),
		"creation": timestamp(row["creation"]),
		"summary": plain_text(row["subject"]),
		"excerpt": inbox_excerpt(row),
		"actor": people.get(row["from_user"]) if row["from_user"] else None,
		"record": inbox_record(row),
	}


def inbox_excerpt(row: InboxRow) -> str | None:
	"""The comment a mention came from, as plain text.

	Only a mention's ``email_content`` is worth showing: it holds the
	comment's HTML, while an assignment's only repeats the task's subject
	(and is empty once the assignment is removed).
	"""
	if row["type"] != "Mention":
		return None
	return plain_text(row["email_content"]) or None


def plain_text(markup: str | None) -> str:
	return html.unescape(strip_html(markup or "")).strip()


def inbox_person(user: dict) -> InboxPerson:
	return {"name": user["name"], "full_name": user["full_name"], "user_image": user["user_image"]}


def inbox_record(row: InboxRow) -> InboxRecord:
	"""The record an Inbox row opens, with what its page's route needs."""
	document_type = row["document_type"]
	status = None
	if document_type == "Task":
		kind: InboxRecordKind = "milestone" if row["is_milestone"] else "task"
		title = row["task_title"]
		# None too once the Task is gone, as the join finds nothing.
		status = row["task_status"]
	else:
		kind = RECORD_KINDS[document_type]
		title = {
			"module": row["module_title"],
			"link": row["link_title"],
			"project": row["project_title"],
		}[kind]
	return {
		"kind": kind,
		"name": row["document_name"],
		"title": title,
		"project": row["project"],
		"project_title": row["project_title"],
		"status": status,
	}
