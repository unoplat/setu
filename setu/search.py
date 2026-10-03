from functools import cached_property
from typing import ClassVar

import frappe
from frappe.model.document import Document
from frappe.search.sqlite_search import SQLiteSearch

# The full-text index behind the ⌘K search (Paper: search-experience, A).
# Frappe's SQLiteSearch keeps an FTS5 index in the site folder: registered in
# hooks.py (``sqlite_search``), it is built after ``bench migrate``, checked
# every three hours, and updated whenever an indexed record is saved or
# deleted. It finds candidates only: setu.api.search reads each one back
# through the permission-checked database before showing it, since the index
# may be stale and does not know about Cancelled Tasks or record-level permissions.


class EnvisionSearch(SQLiteSearch):
	INDEX_NAME = "envision_search.db"
	INDEX_SCHEMA: ClassVar[dict] = {
		"text_fields": ["title", "content"],
		# Filtered on in the index: the project, so a search only scans
		# projects this user can open in Envision.
		"metadata_fields": ["project", "is_milestone", "modified"],
		# Hyphens and underscores stay inside a word, as in "TASK-2026-00031".
		"tokenizer": "unicode61 remove_diacritics 2 tokenchars '-_'",
	}
	INDEXABLE_DOCTYPES: ClassVar[dict] = {
		# Milestones are Tasks too (docs/adr/0001); is_milestone tells them apart.
		"Task": {
			"fields": [
				"name",
				{"title": "subject"},
				{"content": "description"},
				"project",
				"is_milestone",
				"modified",
			],
			"filters": {"is_template": 0},
		},
		"Envision Module": {
			"fields": ["name", {"title": "module_name"}, {"content": "description"}, "project", "modified"],
		},
	}

	# Off for the first try: correcting a half-typed word ("perm") can swap it
	# for a different one. setu.api.search turns it on when nothing matched.
	correct_spelling = False

	@cached_property
	def readable_projects(self) -> dict[str, str]:
		"""Envision projects this user can read, as name → title."""
		rows = frappe.get_list(
			"Project",
			filters={"envision_enabled": 1},
			fields=["name", "project_name"],
			limit_page_length=0,
		)
		return {row.name: row.project_name or row.name for row in rows}

	def get_search_filters(self) -> dict:
		# An empty list matches nothing, so a user with no projects finds nothing.
		return {"project": list(self.readable_projects)}

	def prepare_document(self, doc):
		# The framework skips a record whose content is None, and many Tasks
		# have no description: index them with an empty one so their titles
		# are still found. A copy, so a Task being saved is left as it is.
		doc = frappe._dict(doc.as_dict() if isinstance(doc, Document) else doc)
		doc.description = doc.get("description") or ""
		return super().prepare_document(doc)

	def _prepare_fts_query(self, query):
		# Every word is a prefix from its second letter, since results show as
		# the user types; the framework waits for four.
		terms = [term.replace('"', '""') for term in query.strip().split()]
		return " ".join(f'"{term}"*' if len(term) > 1 else f'"{term}"' for term in terms)

	def _expand_query_with_corrections(self, query):
		if self.correct_spelling:
			return super()._expand_query_with_corrections(query)
		return query.strip(), None
