import json
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.desk.form.load import add_comments, get_versions
from frappe.desk.form.utils import add_comment
from frappe.utils import get_datetime, get_fullname, get_system_timezone, strip_html

# The Activity section of Envision's record pages (Paper: 06d, 07d): the same
# records Desk's form timeline reads, for any document, plus commenting on it.


def document_activity(doc) -> dict:
	"""A document's timeline, newest first, and who appears in it.

	Comments, assignment and other logged events (Comment rows, split by
	Frappe's own ``add_comments``), tracked changes (Version rows, when the
	DocType tracks changes) and the creation itself, sorted into one list.
	"""
	docinfo = frappe._dict()
	add_comments(doc, docinfo)

	entries = [
		{
			"id": f"created:{doc.name}",
			"kind": "created",
			"owner": doc.owner,
			"creation": timestamp(doc.creation),
		}
	]
	for comment in docinfo.comments:
		entries.append(
			{
				"id": comment.name,
				"kind": "comment",
				"owner": comment.owner,
				"creation": timestamp(comment.creation),
				# Sanitised by Comment.validate when it was saved.
				"content": comment.content,
			}
		)
	for kind, rows in (
		("assignment", docinfo.assignment_logs),
		("attachment", docinfo.attachment_logs),
		("info", docinfo.info_logs + docinfo.shared),
	):
		for row in rows:
			entries.append(
				{
					"id": row.name,
					"kind": kind,
					"owner": row.owner,
					"creation": timestamp(row.creation),
					"content": strip_html(row.content or ""),
				}
			)
	for version in get_versions(doc):
		fields = changed_fields(doc, version.data)
		if fields:
			entries.append(
				{
					"id": version.name,
					"kind": "change",
					"owner": version.owner,
					"creation": timestamp(version.creation),
					"content": ", ".join(fields),
				}
			)

	entries.sort(key=lambda entry: entry["creation"], reverse=True)
	return {"entries": entries, "users": people_details({entry["owner"] for entry in entries})}


def comment_on(doc, content: str) -> dict:
	"""Comment on a document the user may read.

	Frappe's own ``add_comment`` does the work, so @mentions notify people and
	the comment shows on the document's Desk timeline. The author is always the
	session user rather than whatever the client sends.
	"""
	if not strip_html(content or "").strip() and "<img" not in (content or ""):
		frappe.throw(_("Write a comment first."), frappe.MandatoryError)
	comment = add_comment(
		reference_doctype=doc.doctype,
		reference_name=doc.name,
		content=content,
		comment_email=frappe.session.user,
		comment_by=get_fullname(frappe.session.user),
	)
	return {"name": comment.name}


def changed_fields(doc, data: str) -> list[str]:
	"""Labels of the fields a Version changed, as Desk's timeline names them."""
	try:
		changed = json.loads(data or "{}").get("changed") or []
	except ValueError:
		return []
	return [_(doc.meta.get_label(fieldname)) for fieldname, *_values in changed]


def timestamp(value) -> str:
	"""An ISO datetime with its offset. Frappe stores naive datetimes in the
	system time zone, and the browser shows "2 hours ago" in its own."""
	return get_datetime(value).replace(tzinfo=ZoneInfo(get_system_timezone())).isoformat()


def people_details(user_ids: set[str]) -> dict[str, dict]:
	"""Name and avatar per user, never contact details (as list_assignees)."""
	if not user_ids:
		return {}
	return {
		user["name"]: user
		for user in frappe.get_all(
			"User",
			filters={"name": ("in", list(user_ids))},
			fields=["name", "full_name", "user_image"],
		)
	}
