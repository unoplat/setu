import frappe
from frappe import _
from frappe.model.document import Document

from setu.github import delta as github_delta

# Work that failed and waits for the retry cron (docs/adr/0008). One row per
# target, named by job_key, and only while its delta is non-empty. Generic
# DocType access is read-only (System Manager in the JSON); rows change only
# through server code, and every save passes the checks below, because the cron
# calls the row's handler by name.


class EnvisionRetryJob(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		attempts: DF.Int
		delta: DF.JSON
		error_log: DF.Link | None
		handler: DF.Data
		integration: DF.Literal["GitHub"]
		job_key: DF.Data
		next_retry_at: DF.Datetime | None
		reference_doctype: DF.Link | None
		reference_name: DF.DynamicLink | None
		started_at: DF.Datetime | None
		status: DF.Literal["Pending", "Running"]
		target: DF.JSON
	# end: auto-generated types

	def validate(self) -> None:
		direction = github_delta.job_direction(self.job_key)
		if direction is None:
			frappe.throw(
				_("Job Key {0} must be github:issue:REPOSITORY_ID:ISSUE_ID or github:task:TASK_NAME.").format(
					self.job_key
				)
			)
		else:
			self.validate_handler(direction)
			self.validate_target(direction)
			self.validate_delta(direction)

	def validate_handler(self, direction: github_delta.Direction) -> None:
		if self.handler not in frappe.get_hooks("retry_job_handlers"):
			frappe.throw(_("Handler {0} is not in the retry_job_handlers hook.").format(self.handler))
		expected = github_delta.HANDLERS[direction]
		if self.handler != expected:
			frappe.throw(_("Job Key {0} must use handler {1}.").format(self.job_key, expected))

	def validate_target(self, direction: github_delta.Direction) -> None:
		target = github_delta.parse_object(self.target)
		if target is None or not github_delta.is_valid_target(target, direction):
			if direction == "inbound":
				frappe.throw(_("Target must hold exactly repository_id, issue_id and issue_number."))
			else:
				frappe.throw(_("Target must hold exactly link."))

	def validate_delta(self, direction: github_delta.Direction) -> None:
		entries = github_delta.parse_delta(self.delta)
		if entries is None:
			frappe.throw(_("Delta must be a JSON object of resources and actions."))
		elif not entries:
			frappe.throw(_("Delta cannot be empty: delete the Retry Job instead."))
		elif unknown := github_delta.unknown_entries(entries, direction):
			frappe.throw(_("Delta has entries outside its vocabulary: {0}").format(", ".join(unknown)))
