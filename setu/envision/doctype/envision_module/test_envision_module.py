import frappe
from frappe.tests import IntegrationTestCase

from setu.api.module import create_module, get_module, list_modules, summary, update_module
from setu.api.project import create_project, delete_project


class TestEnvisionModule(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		# Roll back the company/defaults and clear caches even if setup fails.
		self.addCleanup(frappe.clear_cache)
		self.addCleanup(frappe.db.rollback)
		if not frappe.db.exists("Company", "Unoplat"):
			frappe.get_doc(
				{
					"doctype": "Company",
					"company_name": "Unoplat",
					"abbr": "UNOP",
					"default_currency": "INR",
					"country": "India",
					"create_chart_of_accounts_based_on": "Standard Template",
					"chart_of_accounts": "Standard",
				}
			).insert()
		# Frappe resolves Company defaults through the lowercase storage key.
		frappe.defaults.set_user_default("company", "Unoplat")
		self.project = create_project(frappe.generate_hash(length=10))["name"]

	def test_project_uses_unoplat_company(self):
		self.assertEqual(frappe.defaults.get_user_default("Company"), "Unoplat")
		self.assertEqual(frappe.db.get_value("Project", self.project, "company"), "Unoplat")

	def test_duplicate_name_in_a_project_is_refused(self):
		create_module(self.project, "Payments")
		with self.assertRaises(frappe.DuplicateEntryError):
			create_module(self.project, "  payments ")

	def test_same_name_in_another_project_is_allowed(self):
		other = create_project(frappe.generate_hash(length=10))["name"]
		create_module(self.project, "Payments")
		self.assertEqual(create_module(other, "Payments")["module_name"], "Payments")

	def test_lead_is_optional(self):
		module = create_module(self.project, "Onboarding")
		self.assertIsNone(module["lead"])

	def test_name_is_required(self):
		with self.assertRaises(frappe.MandatoryError):
			create_module(self.project, "   ")

	def test_update_changes_only_what_was_sent(self):
		created = create_module(self.project, "Payments", description="<p>Checkout</p>", lead="Administrator")
		updated = update_module(created["name"], module_name="Payments & Billing")
		self.assertEqual(updated["module_name"], "Payments & Billing")
		self.assertEqual(updated["lead"]["name"], "Administrator")
		self.assertIn("Checkout", updated["description"])

		cleared = update_module(created["name"], lead="")
		self.assertIsNone(cleared["lead"])
		self.assertEqual(get_module(created["name"])["project"], self.project)

	def test_a_module_moves_to_another_project(self):
		other = create_project(frappe.generate_hash(length=10))["name"]
		created = create_module(self.project, "Payments", lead="Administrator")
		moved = update_module(created["name"], project=other)
		self.assertEqual(moved["project"], other)
		self.assertEqual(moved["lead"]["name"], "Administrator")
		self.assertEqual(list_modules(self.project), [])
		self.assertEqual([row["name"] for row in list_modules(other)], [created["name"]])

	def test_moving_into_a_project_with_that_name_is_refused(self):
		other = create_project(frappe.generate_hash(length=10))["name"]
		create_module(other, "Payments")
		created = create_module(self.project, "payments")
		with self.assertRaises(frappe.DuplicateEntryError):
			update_module(created["name"], project=other)

	def test_a_module_cannot_lose_its_project(self):
		created = create_module(self.project, "Payments")
		with self.assertRaises(frappe.MandatoryError):
			update_module(created["name"], project="")

	def test_list_is_scoped_to_the_project_and_sorted_by_name(self):
		create_module(self.project, "Payments")
		create_module(self.project, "Onboarding")
		create_module(create_project(frappe.generate_hash(length=10))["name"], "Elsewhere")
		self.assertEqual(
			[row["module_name"] for row in list_modules(self.project)],
			["Onboarding", "Payments"],
		)

	def test_deleting_a_project_removes_its_modules(self):
		module = create_module(self.project, "Payments")
		delete_project(self.project)
		self.assertFalse(frappe.db.exists("Envision Module", module["name"]))

	def test_summary_is_one_line_of_plain_text(self):
		self.assertEqual(summary("<p>Checkout,</p><ul><li>refunds</li></ul>"), "Checkout, refunds")
		long = summary("<p>" + "word " * 60 + "</p>")
		self.assertLessEqual(len(long), 161)
		self.assertTrue(long.endswith("…"))
