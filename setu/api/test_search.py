from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from setu.api.milestone import create_milestone
from setu.api.module import create_module
from setu.api.project import create_project
from setu.api.search import excerpt, run_search
from setu.api.task import archive_task, create_task
from setu.search import EnvisionSearch


class IsolatedSearch(EnvisionSearch):
	"""The real index's configuration in a file of its own, so the tests
	never rebuild or drop the site's index."""

	INDEX_NAME = "envision_search_test.db"


class TestSearch(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.project = create_project(frappe.generate_hash(length=10))["name"]
		# A word no other record on the site contains.
		self.word = "quokka" + frappe.generate_hash(length=6).lower()
		IsolatedSearch().drop_index()

	def tearDown(self):
		IsolatedSearch().drop_index()
		frappe.db.rollback()

	def search(self, text: str) -> dict:
		"""Index what the test created, then search as the endpoint does."""
		IsolatedSearch().build_index()
		return run_search(text, IsolatedSearch())

	def test_finds_tasks_milestones_and_modules_by_their_description(self):
		create_task(self.project, "Review portal rules", description=f"<p>Validate {self.word} first</p>")
		create_milestone(
			self.project, "Private beta", description=f"<p>{self.word} audit</p>", due_date="2026-12-31"
		)
		create_module(self.project, "Access control", description=f"<p>Roles and {self.word}</p>")

		results = self.search(self.word)["results"]

		self.assertEqual(sorted(row["type"] for row in results), ["milestone", "module", "task"])
		task = next(row for row in results if row["type"] == "task")
		self.assertEqual(task["title"], "Review portal rules")
		self.assertEqual(task["project"], self.project)
		self.assertEqual(task["matched_in"], ["description"])
		self.assertIn({"text": self.word, "match": True}, task["excerpt"])

	def test_a_word_matches_as_it_is_typed(self):
		create_task(self.project, f"{self.word} migration")
		results = self.search(self.word[:5])["results"]
		self.assertIn(f"{self.word} migration", [row["title"] for row in results])

	def test_a_task_without_a_description_is_found_by_its_title(self):
		create_task(self.project, f"Plan {self.word}")
		[result] = self.search(self.word)["results"]
		self.assertEqual(result["matched_in"], ["title"])
		self.assertEqual(result["excerpt"], [])

	def test_an_archived_task_is_not_shown(self):
		task = create_task(self.project, f"Retire {self.word}")
		IsolatedSearch().build_index()
		# Archiving does not touch the index; the database read drops it.
		archive_task(task["name"])
		self.assertEqual(run_search(self.word, IsolatedSearch())["results"], [])

	def test_projects_outside_envision_are_not_searched(self):
		create_task(self.project, f"Hidden {self.word}")
		frappe.db.set_value("Project", self.project, "envision_enabled", 0)
		self.assertEqual(self.search(self.word)["results"], [])

	def test_a_single_letter_searches_nothing(self):
		self.assertEqual(
			run_search("q", IsolatedSearch()),
			{"results": [], "indexing": False, "corrected_query": None},
		)

	def test_a_missing_index_starts_a_build_and_says_so(self):
		with patch("setu.api.search.build_index_in_background") as build:
			response = run_search(self.word, IsolatedSearch())
		self.assertTrue(response["indexing"])
		self.assertEqual(response["results"], [])
		build.assert_called_once()

	def test_excerpt_keeps_the_match_in_view(self):
		parts = excerpt("one two three four five six seven eight nine ten <mark>perm</mark>issions...")
		self.assertEqual(parts[0], {"text": "…three four five six seven eight nine ten ", "match": False})
		self.assertEqual(parts[1], {"text": "perm", "match": True})
		self.assertEqual(parts[2], {"text": "issions…", "match": False})
