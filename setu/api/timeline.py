import json
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.core.doctype.file.utils import extract_images_from_html
from frappe.desk.form.document_follow import _follow_document
from frappe.desk.form.load import add_comments, get_versions
from frappe.utils import get_datetime, get_fullname, get_system_timezone, markdown, sanitize_html, strip_html

# The Activity section of Envision's record pages (Paper: 06d, 07d): the same
# records Desk's form timeline reads, for any document, plus commenting on it.

# A reply's copy of the one comment it quotes (Paper: Comments 01 to 04).
QUOTE_FIELDS = [
	"envision_reply_to",
	"envision_quote_owner",
	"envision_quote_creation",
	"envision_quote_content",
]


def document_activity(doc) -> dict:
	"""A document's timeline, newest first, and who appears in it.

	Comments, assignment and other logged events (Comment rows, split by
	Frappe's own ``add_comments``), tracked changes (Version rows, when the
	DocType tracks changes) and the creation itself, sorted into one list.
	"""
	docinfo = frappe._dict()
	add_comments(doc, docinfo)
	# add_comments reads a fixed list of fields, so the quotes come separately.
	quotes = (
		{
			row.name: row
			for row in frappe.get_all(
				"Comment",
				filters={"name": ("in", [comment.name for comment in docinfo.comments])},
				fields=["name", *QUOTE_FIELDS],
			)
		}
		if docinfo.comments
		else {}
	)

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
				"quote": quote_entry(quotes.get(comment.name)),
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
	# A quoted author may have no entry of their own once their comment is deleted.
	people = {entry["owner"] for entry in entries}
	people.update(entry["quote"]["owner"] for entry in entries if entry.get("quote"))
	return {"entries": entries, "users": people_details(people)}


def quote_entry(row) -> dict | None:
	"""The comment a reply quotes, as it read when the reply was posted. ``id``
	is None once that comment is deleted: the quote stays, the jump does not."""
	if not row or not row.envision_quote_owner:
		return None
	return {
		"id": row.envision_reply_to,
		"owner": row.envision_quote_owner,
		"creation": timestamp(row.envision_quote_creation),
		# Read like the comment itself (add_comments renders legacy markdown).
		"content": markdown(row.envision_quote_content or ""),
	}


def comment_on(doc, content: str, reply_to: str | None = None) -> dict:
	"""Comment on a document the user may read, optionally quoting one comment
	on it (``reply_to``); validate_quote copies that comment into the reply.

	It does what Frappe's own ``add_comment`` does, which takes no quote: the
	Comment record notifies @mentions and shows on the document's Desk
	timeline. The author is always the session user rather than whatever the
	client sends.
	"""
	if not strip_html(content or "").strip() and "<img" not in (content or ""):
		frappe.throw(_("Write a comment first."), frappe.MandatoryError)
	comment = frappe.new_doc("Comment")
	comment.update(
		{
			"comment_type": "Comment",
			"reference_doctype": doc.doctype,
			"reference_name": doc.name,
			"comment_email": frappe.session.user,
			"comment_by": get_fullname(frappe.session.user),
			"content": extract_images_from_html(doc, content, is_private=True),
			"envision_reply_to": reply_to or None,
		}
	)
	comment.insert(ignore_permissions=True)
	if frappe.get_cached_value("User", frappe.session.user, "follow_commented_documents"):
		_follow_document(doc.doctype, doc.name, frappe.session.user)
	return {"name": comment.name}


def validate_quote(doc, method=None):
	"""Comment validate hook: a reply quotes one whole comment on the same
	record, copied when the reply is posted and never changed after.

	The copy is the original's own words, never the quote inside it, so quotes
	do not nest; it lives outside ``content``, so quoted @mentions do not
	notify again. An edited original keeps the replies' quotes as they were:
	answering the new words takes a new reply.
	"""
	if not doc.is_new():
		# Fixed once posted. release_quotes clears envision_reply_to directly.
		before = doc.get_doc_before_save()
		if before:
			for fieldname in QUOTE_FIELDS:
				doc.set(fieldname, before.get(fieldname))
		return

	if not doc.envision_reply_to:
		# A quote only ever comes from the comment it names.
		for fieldname in QUOTE_FIELDS:
			doc.set(fieldname, None)
		return

	original = frappe.db.get_value(
		"Comment",
		doc.envision_reply_to,
		["comment_type", "reference_doctype", "reference_name", "owner", "creation", "content"],
		as_dict=True,
	)
	# The same record, so a reply never reveals a comment its author cannot read.
	if (
		doc.comment_type != "Comment"
		or not original
		or original.comment_type != "Comment"
		or original.reference_doctype != doc.reference_doctype
		or original.reference_name != doc.reference_name
	):
		frappe.throw(_("You can only reply to a comment on the same record."))

	doc.envision_quote_owner = original.owner
	doc.envision_quote_creation = original.creation
	doc.envision_quote_content = sanitize_html(
		original.content or "", always_sanitize=True, disallowed_tags=["form", "input", "button"]
	)


def release_quotes(doc, method=None):
	"""Comment on_trash hook: replies keep their quote of a deleted comment but
	no longer point at it, so they save again and drop "Jump to original"."""
	if doc.comment_type == "Comment":
		frappe.db.set_value(
			"Comment", {"envision_reply_to": doc.name}, "envision_reply_to", None, update_modified=False
		)


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
