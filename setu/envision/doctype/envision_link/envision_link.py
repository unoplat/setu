from urllib.parse import urlsplit

import frappe
from frappe import _
from frappe.model.document import Document

# A Link is a web address the team keeps with a project (its docs, dashboards,
# design files), shown as a door on the project's Links board. ERPNext has no
# record for this, so Envision owns it (docs/adr/0005). Only http and https
# addresses are kept, and Envision never fetches one: no favicon, no preview.

WEB_SCHEMES = ("http", "https")


class EnvisionLink(Document):
	def validate(self):
		self.link_name = (self.link_name or "").strip()
		if not self.link_name:
			frappe.throw(_("Link name is required"), frappe.MandatoryError)
		self.url = (self.url or "").strip()
		# Search indexes the host, never the whole address: a path or query
		# string can hold a token.
		self.host = web_host(self.url)
		self.description = (self.description or "").strip()


def web_host(url: str) -> str:
	"""The lowercase host of an http or https address, or an error."""
	if not url:
		frappe.throw(_("Web address is required"), frappe.MandatoryError)
	try:
		parts = urlsplit(url)
		# Reading the port refuses one that is not a number.
		parts.port
	except ValueError:
		parts = None
	host = (parts.hostname if parts else None) or ""
	if (
		not parts
		or parts.scheme.lower() not in WEB_SCHEMES
		or not host
		or any(char.isspace() for char in url)
	):
		frappe.throw(
			_("Enter a web address that starts with http:// or https://, such as https://example.com."),
			frappe.ValidationError,
		)
	return host
