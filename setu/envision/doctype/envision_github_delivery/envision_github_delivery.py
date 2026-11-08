import frappe
from frappe.model.document import Document
from frappe.query_builder import Interval
from frappe.query_builder.functions import Now


class EnvisionGitHubDelivery(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		action: DF.Data | None
		app_id: DF.Data | None
		attempts: DF.Int
		error: DF.SmallText | None
		event: DF.Data | None
		installation_id: DF.Data | None
		processed_at: DF.Datetime | None
		status: DF.Literal["Queued", "Processing", "Processed", "Ignored", "Deferred", "Failed"]
	# end: auto-generated types

	@staticmethod
	def clear_old_logs(days=30):
		# Frappe's Log Settings only enrolls controllers exposing this method.
		table = frappe.qb.DocType("Envision GitHub Delivery")
		frappe.db.delete(table, filters=(table.creation < (Now() - Interval(days=days))))
