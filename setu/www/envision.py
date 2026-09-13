import frappe
from frappe.utils import escape_html

# Serves the Envision React app (built into setu/public/envision by the
# frontend build; the entry HTML is copied to www/envision.html).
# Deep links resolve here via `website_route_rules` in hooks.py.

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=" + escape_html(frappe.request.path)
		raise frappe.Redirect

	# The SPA sends this back as X-Frappe-CSRF-Token on writes.
	csrf_token = frappe.sessions.get_csrf_token()
	frappe.db.commit()
	context.csrf_token = csrf_token
	return context
