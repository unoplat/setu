app_name = "setu"
app_title = "Envision"
app_publisher = "Unoplat Technologies Private Limited"
app_description = "Project and Knowledge Management"
app_email = "jayghiya@unoplat.io"
app_license = "agpl-3.0"

# Apps
# ------------------

required_apps = ["erpnext"]

# Website
# ------------------

# Deep links into the Envision SPA all render www/envision.html.
website_route_rules = [
	{"from_route": "/envision/<path:app_path>", "to_route": "envision"},
]

# Register the standalone frontend and its permission callback.
# Frappe v16's Desktop tile is shipped in desktop_icon/envision.json.
add_to_apps_screen = [
	{
		"name": "setu",
		"logo": "/assets/setu/images/envision.svg",
		"title": "Envision",
		"route": "/envision",
		"has_permission": "setu.api.permission.has_app_permission",
	}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/setu/css/setu.css"
# app_include_js = "/assets/setu/js/setu.js"

# include js, css files in header of web template
# web_include_css = "/assets/setu/css/setu.css"
# web_include_js = "/assets/setu/js/setu.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "setu/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "setu/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "setu.utils.jinja_methods",
# 	"filters": "setu.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "setu.install.before_install"
# Custom Fields and Property Setters on ERPNext DocTypes, and the built-in
# Link Types (setu/setup/).
after_install = [
	"setu.setup.custom_fields.create_envision_custom_fields",
	"setu.setup.property_setters.create_envision_property_setters",
	"setu.setup.link_types.create_envision_link_types",
]
after_migrate = [
	"setu.setup.custom_fields.create_envision_custom_fields",
	"setu.setup.property_setters.create_envision_property_setters",
	"setu.setup.link_types.create_envision_link_types",
]

# Uninstallation
# ------------

before_uninstall = "setu.setup.uninstall.before_uninstall"
# after_uninstall = "setu.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "setu.utils.before_app_install"
# after_app_install = "setu.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "setu.utils.before_app_uninstall"
# after_app_uninstall = "setu.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "setu.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "setu.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

permission_query_conditions = {
	"Board Message": "setu.envision.doctype.board_message.board_message.get_permission_query_conditions",
	"Envision View": "setu.envision.doctype.envision_view.envision_view.get_permission_query_conditions",
}
has_permission = {
	"Board Message": "setu.envision.doctype.board_message.board_message.has_permission",
	"Envision View": "setu.envision.doctype.envision_view.envision_view.has_permission",
}

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Envision's rules for deleting a Project live in on_trash so Desk and the
# REST API follow them too (setu.api.project.guard_project_delete).
# Frappe's rename updates Link fields but not the names saved inside a Custom
# View's JSON filters, so each rename carries them over (setu.api.view).
doc_events = {
	"Project": {
		"on_trash": "setu.api.project.guard_project_delete",
		"after_rename": "setu.api.view.rename_project_filters",
	},
	"Task": {
		"validate": "setu.api.task.validate_task_links",
	},
	# Frappe's rename leaves the old name in each document's _user_tags.
	"Tag": {
		"after_rename": "setu.api.task.rename_tag",
	},
	"User": {
		"after_rename": "setu.api.view.rename_user_filters",
	},
}

# Search
# ------
# The ⌘K search index (setu/search.py). Frappe builds it after migrate,
# checks it every three hours, and updates it as Tasks, Modules and Links
# change.

sqlite_search = ["setu.search.EnvisionSearch"]

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"setu.tasks.all"
# 	],
# 	"daily": [
# 		"setu.tasks.daily"
# 	],
# 	"hourly": [
# 		"setu.tasks.hourly"
# 	],
# 	"weekly": [
# 		"setu.tasks.weekly"
# 	],
# 	"monthly": [
# 		"setu.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "setu.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
extend_doctype_class = {
	"Task": "setu.api.task.EnvisionTask",
}

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "setu.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "setu.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["setu.utils.before_request"]
# after_request = ["setu.utils.after_request"]

# Job Events
# ----------
# before_job = ["setu.utils.before_job"]
# after_job = ["setu.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"setu.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []
