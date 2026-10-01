import frappe
from frappe.desk.form.document_follow import (
	follow_document,
	is_document_followed,
	unfollow_document,
)
from frappe.utils import cint, sbool, strip_html

from setu.api.task import clean_tags
from setu.api.timeline import comment_on, document_activity, timestamp

MESSAGE_FIELDS = ["name", "title", "project", "category", "is_pinned", "content", "owner", "creation", "modified", "_user_tags"]


@frappe.whitelist()
def list_messages(project: str, category: str | None = None) -> list[dict]:
	"""One Project's messages, pinned first and then newest first."""
	frappe.get_doc("Project", project).check_permission("read")
	filters = {"project": project}
	if category:
		filters["category"] = category
	rows = frappe.get_list(
		"Board Message",
		filters=filters,
		fields=MESSAGE_FIELDS,
		order_by="is_pinned desc, creation desc, name desc",
		limit_page_length=0,
	)
	return [message_summary(row) for row in rows]


@frappe.whitelist()
def get_message(name: str) -> dict:
	return message_detail(message_doc(name))


@frappe.whitelist(methods=["POST"])
def create_message(
	project: str,
	title: str,
	content: str,
	category: str = "Announcement",
	is_pinned: int = 0,
	tags: list[str] | str | None = None,
) -> dict:
	"""Save HTML from Tiptap, not JSON/Markdown; validation also runs in Desk."""
	doc = frappe.new_doc("Board Message")
	doc.update({
		"project": project,
		"title": title,
		"content": content,
		"category": category,
		"is_pinned": is_pinned,
	})
	doc.insert()
	replace_tags(doc, clean_tags(tags))
	return message_detail(doc)


@frappe.whitelist(methods=["POST"])
def update_message(
	name: str,
	title: str | None = None,
	content: str | None = None,
	category: str | None = None,
	is_pinned: int | None = None,
	tags: list[str] | str | None = None,
) -> dict:
	"""Omitted fields stay unchanged; [] explicitly clears tags.

	Messages cannot move between Projects. This preserves the audience of
	comments, files and followed history; the DocType enforces it too.
	"""
	doc = message_doc(name, "write")
	changes = {"title": title, "content": content, "category": category, "is_pinned": is_pinned}
	if any(value is not None for value in changes.values()):
		doc.update({field: value for field, value in changes.items() if value is not None})
		doc.save()
	if tags is not None:
		replace_tags(doc, clean_tags(tags))
	return message_detail(doc)


@frappe.whitelist(methods=["POST"])
def delete_message(name: str) -> dict:
	doc = message_doc(name, "delete")
	frappe.delete_doc("Board Message", doc.name)
	return {"name": doc.name}


@frappe.whitelist()
def get_message_activity(name: str) -> dict:
	return document_activity(message_doc(name))


@frappe.whitelist(methods=["POST"])
def add_message_comment(name: str, content: str) -> dict:
	return comment_on(message_doc(name), content)


@frappe.whitelist(methods=["POST"])
def set_following(name: str, following: bool | str) -> dict:
	"""Only the session user's subscription; native Document Follow sends
	change/comment emails according to their enabled notification settings."""
	doc = message_doc(name)
	if sbool(following):
		follow_document(doc.doctype, doc.name)
	else:
		unfollow_document(doc.doctype, doc.name)
	return {"is_following": bool(is_document_followed(doc.doctype, doc.name, frappe.session.user))}


def message_doc(name: str, ptype: str = "read"):
	doc = frappe.get_doc("Board Message", name)
	doc.check_permission(ptype)
	# Explicit too: a separately shared message must not expose its Project.
	frappe.get_doc("Project", doc.project).check_permission("read")
	return doc


def message_summary(row: dict) -> dict:
	text = " ".join(strip_html(row.get("content") or "").split())
	return {
		"name": row["name"],
		"title": row["title"],
		"project": row["project"],
		"category": row["category"],
		"is_pinned": bool(cint(row["is_pinned"])),
		"summary": text if len(text) <= 160 else text[:157].rstrip() + "…",
		"tags": tags_from_value(row.get("_user_tags")),
		"owner": row["owner"],
		"creation": timestamp(row["creation"]),
		"modified": timestamp(row["modified"]),
	}


def message_detail(doc) -> dict:
	row = doc.as_dict()
	# Tag methods update the database, not necessarily this document instance.
	row["_user_tags"] = frappe.db.get_value(doc.doctype, doc.name, "_user_tags")
	return {
		**message_summary(row),
		"content": doc.content,
		"project_name": frappe.db.get_value("Project", doc.project, "project_name"),
		"can_write": bool(doc.has_permission("write")),
		"can_delete": bool(doc.has_permission("delete")),
		"is_following": bool(is_document_followed(doc.doctype, doc.name, frappe.session.user)),
		# Upload through Frappe's standard upload_file API with attached_to_doctype
		# and attached_to_name. Private files retain their normal access checks.
		"attachments": frappe.get_all(
			"File",
			filters={"attached_to_doctype": doc.doctype, "attached_to_name": doc.name},
			fields=["name", "file_name", "file_url", "is_private"],
			order_by="creation asc",
		),
	}


def tags_from_value(value: str | None) -> list[str]:
	# As on Tasks: get_tags() on some hosts loses the first tag if the cached
	# column does not have a leading comma.
	return [tag for tag in (value or "").split(",") if tag]


def replace_tags(doc, tags: list[str]) -> None:
	current = tags_from_value(frappe.db.get_value(doc.doctype, doc.name, "_user_tags"))
	wanted = {tag.casefold() for tag in tags}
	for tag in current:
		if tag.casefold() not in wanted:
			doc.remove_tag(tag)
	have = {tag.casefold() for tag in current}
	for tag in tags:
		if tag.casefold() not in have:
			doc.add_tag(tag)


def delete_project_messages(project: str) -> None:
	"""Called by Project.on_trash before Frappe checks linked records."""
	for name in frappe.get_all("Board Message", filters={"project": project}, pluck="name"):
		frappe.delete_doc("Board Message", name, ignore_permissions=True)
