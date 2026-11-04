from frappe.model.document import Document


class EnvisionGitHubSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		app_id: DF.Data | None
		app_slug: DF.Data | None
		client_id: DF.Data | None
		client_secret: DF.Password | None
		connected_by: DF.Link | None
		connected_on: DF.Datetime | None
		owner_id: DF.Data | None
		owner_login: DF.Data | None
		owner_type: DF.Literal["", "Organization", "User"]
		private_key: DF.Password | None
		redelivery_cursor: DF.Data | None
		site_binding: DF.Data | None
		site_url_at_creation: DF.Data | None
		subscribed_events: DF.SmallText | None
		webhook_secret: DF.Password | None
	# end: auto-generated types

	pass
