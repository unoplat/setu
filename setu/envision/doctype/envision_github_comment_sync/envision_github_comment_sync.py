from frappe.model.document import Document

# One Task comment's copy on its GitHub Issue (setu.github.comments). Rows change
# only through setu.github, so generic DocType access is read-only, System Manager
# only; the Envision UI reads the projection in setu.api.timeline.


class EnvisionGitHubCommentSync(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		author_login: DF.Data | None
		comment: DF.Data
		create_marker: DF.Data | None
		create_requested_at: DF.Datetime | None
		github_comment_id: DF.Data | None
		github_url: DF.Data | None
		issue_sync: DF.Link
		origin: DF.Literal["Envision", "GitHub"]
	# end: auto-generated types
