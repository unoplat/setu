from urllib.parse import quote

import frappe

# Serves the Envision React app (built into setu/public/envision by the
# frontend build; the entry HTML is copied to www/envision.html).
# Deep links resolve here via `website_route_rules` in hooks.py.

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		# Keep the query string (e.g. ?view=board) so the user lands on the
		# exact URL they were sent after signing in. Built by hand because
		# werkzeug's `full_path` appends a trailing "?" even when empty.
		target = frappe.request.path
		if frappe.request.query_string:
			target += "?" + frappe.request.query_string.decode()
		frappe.local.flags.redirect_location = "/login?redirect-to=" + quote(target, safe="")
		raise frappe.Redirect

	# The SPA sends this back as X-Frappe-CSRF-Token on writes.
	csrf_token = frappe.sessions.get_csrf_token()
	# Persist a newly generated token on this GET through Frappe's normal
	# request transaction handling instead of committing mid-request.
	frappe.local.flags.commit = True
	context.csrf_token = csrf_token
	# Frappe v16 realtime connections use the site name as their namespace.
	context.frappe_site_name = frappe.local.site
	return context
