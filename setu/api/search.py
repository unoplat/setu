import re

import frappe
from frappe.search.sqlite_search import build_index_in_background

from setu.search import EnvisionSearch

# Envision's search across projects (Paper: search-experience, A — the ⌘K
# dialog). Tasks, modules and milestones match on their title or description;
# the dialog groups them by kind. The full-text index (setu/search.py) finds
# candidates, and each one is read back through frappe.get_list, so a result
# is only shown if this user may open it and Envision would list it: not
# archived, not Cancelled, not a template, in an Envision project.

# Results show from the second letter typed, as the dialog asks for them.
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 100
RESULT_LIMIT = 30

# Words of description kept before the first match, so the match stays in view
# on one line of the dialog.
EXCERPT_LEAD_WORDS = 8

MARK = re.compile(r"(<mark>.*?</mark>)", re.S)


@frappe.whitelist()
def search(text: str) -> dict:
	"""Tasks, modules and milestones matching ``text``, best match first.

	Returns ``indexing: True`` with no results while the index is still being
	built (after a fresh install or migrate), so the dialog can say so.
	"""
	return run_search(text, EnvisionSearch())


def run_search(text: str, engine: EnvisionSearch) -> dict:
	text = (text or "").strip()[:MAX_QUERY_LENGTH]
	response = {"results": [], "indexing": False, "corrected_query": None}
	if len(text) < MIN_QUERY_LENGTH or not engine.readable_projects:
		return response
	if not engine.index_exists():
		# Deduplicated by Frappe, so asking again while it builds is harmless.
		build_index_in_background()
		return {**response, "indexing": True}

	found = engine.search(text)
	if not found["results"]:
		engine.correct_spelling = True
		found = engine.search(text)
	hits = found["results"]

	rows = live_rows(hits, engine.readable_projects)
	results = []
	for hit in hits:
		row = rows.get((hit["doctype"], hit["name"]))
		if row:
			results.append(search_result(hit, row, engine.readable_projects))
		if len(results) == RESULT_LIMIT:
			break
	return {
		**response,
		"results": results,
		"corrected_query": found["summary"]["corrected_query"] if results else None,
	}


def live_rows(hits: list[dict], projects: dict[str, str]) -> dict[tuple[str, str], dict]:
	"""The hits Envision lists and this user may read, read from the database.

	frappe.get_list applies role and user permissions; the filters drop what
	the index cannot know about, such as a Task archived since it was indexed.
	"""
	rows = {}
	tasks = [hit["name"] for hit in hits if hit["doctype"] == "Task"]
	if tasks:
		for row in frappe.get_list(
			"Task",
			filters={
				"name": ["in", tasks],
				"project": ["in", list(projects)],
				"is_template": 0,
				"status": ["!=", "Cancelled"],
				"envision_archived_on": ["is", "not set"],
			},
			fields=["name", "subject", "status", "project", "is_milestone"],
			limit_page_length=0,
		):
			rows[("Task", row.name)] = row
	modules = [hit["name"] for hit in hits if hit["doctype"] == "Envision Module"]
	if modules:
		for row in frappe.get_list(
			"Envision Module",
			filters={"name": ["in", modules], "project": ["in", list(projects)]},
			fields=["name", "module_name", "project"],
			limit_page_length=0,
		):
			rows[("Envision Module", row.name)] = row
	return rows


def search_result(hit: dict, row: dict, projects: dict[str, str]) -> dict:
	if hit["doctype"] == "Envision Module":
		kind, title = "module", row.module_name
	else:
		kind, title = ("milestone" if row.is_milestone else "task"), row.subject
	return {
		"type": kind,
		"name": row.name,
		# From the database, not the index, in case it was renamed since.
		"title": title,
		"project": row.project,
		"project_name": projects.get(row.project),
		"status": row.get("status"),
		"matched_in": [
			field
			for field, value in (("title", hit.get("title")), ("description", hit.get("content")))
			if "<mark>" in (value or "")
		],
		"excerpt": excerpt(hit.get("content") or ""),
	}


def excerpt(snippet: str) -> list[dict]:
	"""The index's description snippet as text parts, the matches flagged.

	Parts rather than HTML, so the dialog never renders markup from a record.
	Only a few words are kept before the first match, so it stays in view.
	"""
	parts = []
	for piece in MARK.split(snippet.replace("...", "…")):
		if piece.startswith("<mark>"):
			parts.append({"text": piece[len("<mark>") : -len("</mark>")], "match": True})
		elif piece:
			parts.append({"text": piece, "match": False})

	if len(parts) > 1 and not parts[0]["match"]:
		lead = parts[0]["text"]
		words = lead.split()
		if len(words) > EXCERPT_LEAD_WORDS:
			# The space before the match, if any, stays.
			space = " " if lead.endswith(" ") else ""
			parts[0]["text"] = "…" + " ".join(words[-EXCERPT_LEAD_WORDS:]) + space
	return parts
