import frappe
from frappe.model.document import Document
from frappe.query_builder import Interval
from frappe.query_builder.functions import Now


class EnvisionGitHubDelivery(Document):
	@staticmethod
	def clear_old_logs(days=30):
		# Frappe's Log Settings only enrolls controllers exposing this method.
		table = frappe.qb.DocType("Envision GitHub Delivery")
		frappe.db.delete(table, filters=(table.creation < (Now() - Interval(days=days))))
