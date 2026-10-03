from html import unescape

import frappe
from bs4 import BeautifulSoup
from frappe import _
from frappe.model.db_query import DatabaseQuery
from frappe.model.document import Document
from frappe.utils import sanitize_html


class BoardMessage(Document):
	"""A durable project message. Tags, replies, files and follows are native
	Frappe records, not duplicated in custom fields (ADR 0003)."""

	def validate(self):
		self.title = (self.title or "").strip()
		if not self.title:
			frappe.throw(_("Message title is required"), frappe.MandatoryError)
		if not self.project:
			frappe.throw(_("A board message belongs to a project"), frappe.MandatoryError)
		frappe.get_doc("Project", self.project).check_permission("read")

		# Force sanitization even for privileged writers and JSON-looking input.
		# Keep data-* attributes used by Tiptap and the existing data-rte- bridge.
		self.content = sanitize_html((self.content or "").strip(), always_sanitize=True)
		body = BeautifulSoup(self.content, "html.parser")
		has_text = bool(unescape(body.get_text()).strip())
		has_media = any(media.get("src") for media in body.find_all(["img", "video", "audio", "source"]))
		if not has_text and not has_media:
			frappe.throw(_("Message content is required"), frappe.MandatoryError)


def has_permission(doc, ptype="read", user=None):
	"""Restrict, never grant, the DocType's role permissions by Project access."""
	user = user or frappe.session.user
	if user == "Guest":
		return False
	if not doc.project:
		return None if ptype == "create" else False
	if not frappe.has_permission("Project", "read", doc=doc.project, user=user):
		return False
	return None


def get_permission_query_conditions(user=None):
	"""Desk, REST lists and reports must obey the same Project scope as reads.

	Let Frappe build the Project subquery, including user permissions, sharing
	and ERPNext's own query hook, rather than duplicating its access model.
	"""
	user = user or frappe.session.user
	if user == "Guest" or not frappe.has_permission("Project", "read", user=user):
		return "1=0"
	query = DatabaseQuery("Project", user=user).execute(
		fields=["name"], order_by="", limit_page_length=0, run=False
	)
	return f"`tabBoard Message`.`project` in ({query})"
