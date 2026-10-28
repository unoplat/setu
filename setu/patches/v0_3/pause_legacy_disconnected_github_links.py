"""Keep links stopped when removing the former Task-level disconnect state.

Identity, uncertain-create markers and operations are untouched. This reason
is not a route pause, so activation/reconnection never resumes these links;
only explicit Task Resume compares both sides and restarts their work.
"""

import frappe

from setu.github import store


def execute() -> None:
	if not frappe.db.exists("DocType", store.ISSUE_SYNC):
		return

	# A direct update also works after model sync removes the old Select option.
	# Leave modified alone: this is a compatibility backfill, not a Task edit.
	link = frappe.qb.DocType(store.ISSUE_SYNC)
	(
		frappe.qb.update(link)
		.set(link.sync_state, "Paused")
		.set(link.paused_reason, "legacy_disconnected")
		.where(link.sync_state == "Disconnected")
	).run()
	frappe.clear_document_cache(store.ISSUE_SYNC)
