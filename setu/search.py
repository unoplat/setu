from functools import cached_property
from typing import ClassVar

import frappe
from frappe.model.document import Document
from frappe.search.sqlite_search import SQLiteSearch

# The full-text index behind the ⌘K search (Paper: search-experience, A).
# Frappe's SQLiteSearch keeps an FTS5 index in the site folder. Registered in
# hooks.py (``sqlite_search``), Frappe builds it after ``bench migrate`` when it
# is missing, and every three hours resumes an unfinished build or starts one
# for a missing index. It does not repair an index that exists but is stale.
# Envision keeps it in step itself: setu.search_maintenance reindexes or
# removes each Task, Module and Link after its change commits. The index only
# finds candidates: setu.api.search reads each one back through the
# permission-checked database before showing it, since the index may still lag
# and does not know about record-level permissions.


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
				# Read for is_indexable, and watched for changes like the rest.
				"is_template",
				"status",
			],
			# Narrows what a build reads; is_indexable is the rule.
			"filters": {"is_template": 0, "status": ["!=", "Cancelled"]},
		},
		"Envision Module": {
			"fields": ["name", {"title": "module_name"}, {"content": "description"}, "project", "modified"],
		},
		# Never the full address, whose path or query string can hold a token:
		# prepare_document adds the host and the type's name (the type's record
		# name) to the description. Listed here so a change to them reindexes.
		"Envision Link": {
			"fields": [
				"name",
				{"title": "link_name"},
				{"content": "description"},
				"host",
				"link_type",
				"project",
				"modified",
			],
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

	@cached_property
	def envision_projects(self) -> frozenset[str]:
		"""Every Envision project, whoever is asking: what may be indexed."""
		return frozenset(frappe.get_all("Project", filters={"envision_enabled": 1}, pluck="name"))

	def is_indexable(self, doc) -> bool:
		"""Whether a record belongs in the index, as setu.api.search would list
		it: in an Envision project and, for a Task, neither a template nor
		Cancelled. Builds and setu.search_maintenance both go by this, so a
		record that stops qualifying is taken out rather than left behind."""
		if doc.doctype not in self.INDEXABLE_DOCTYPES:
			return False
		if doc.doctype == "Task" and (doc.get("is_template") or doc.get("status") == "Cancelled"):
			return False
		return doc.get("project") in self.envision_projects

	def get_search_filters(self) -> dict:
		# An empty list matches nothing, so a user with no projects finds nothing.
		return {"project": list(self.readable_projects)}

	def prepare_document(self, doc):
		# None leaves the record out. The framework never removes a row on its
		# own, so setu.search_maintenance does that for a record that drops out.
		if not self.is_indexable(doc):
			return None
		# The framework skips a record whose content is None, and many Tasks
		# have no description: index them with an empty one so their titles
		# are still found. A copy, so a Task being saved is left as it is.
		doc = frappe._dict(doc.as_dict() if isinstance(doc, Document) else doc)
		doc.description = doc.get("description") or ""
		if doc.doctype == "Envision Link":
			doc.description = " ".join(
				part for part in (doc.description, doc.get("host"), doc.get("link_type")) if part
			)
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
