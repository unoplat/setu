"""Add Envision's Cancelled Tasks to the search index.

Cancelled used to be left out of the index (setu.search.EnvisionSearch.is_indexable).
Now that Cancelled is a Board column, they are found like any other Task. A Task
changed from now on is reconciled by setu.search_maintenance; this queues the ones
already Cancelled, which no change would otherwise bring in.
"""

import frappe

from setu.search_maintenance import enqueue_reconcile


def execute() -> None:
	# Patches run before after_migrate creates the custom field; on a site
	# without it there is no Envision Project, so nothing to index.
	if not frappe.db.has_column("Project", "envision_enabled"):
		return

	projects = frappe.get_all("Project", filters={"envision_enabled": 1}, pluck="name")
	if not projects:
		return
	names = frappe.get_all(
		"Task",
		filters={"project": ["in", projects], "status": "Cancelled", "is_template": 0},
		pluck="name",
	)
	if names:
		# The job skips everything while there is no index: a build reads them.
		enqueue_reconcile([("Task", name) for name in names])
