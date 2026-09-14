import frappe
from frappe import _
from frappe.utils import md_to_html

# Users that never show up as invitable members.
SYSTEM_USERS = ("Administrator", "Guest")


@frappe.whitelist()
def create_project(
	project_name: str,
	description: str | None = None,
	members: list[str] | str | None = None,
) -> dict:
	"""Create an Envision-managed ERPNext Project from the Create Project wizard.

	- Company is resolved server-side so the wizard never asks for it.
	- The description arrives as Markdown (MDXEditor). The source is kept in the
	  Envision custom field and the rendered HTML goes into ERPNext's ``notes``
	  so Desk users see the same text.
	- Membership reuses ERPNext's ``Project User`` child table. The creator is
	  always the first member; ``members`` are the users picked in step 2.
	  Nobody else can see the project (see setu.permissions.project).
	- ``welcome_email_sent`` is pre-set so ERPNext's own invitation email does
	  not fire; Envision owns invitation semantics.
	"""
	require_project_creator()

	project_name = (project_name or "").strip()
	if not project_name:
		frappe.throw(_("Project name is required"), frappe.MandatoryError)

	member_users = validate_members(parse_members(members))

	doc = frappe.new_doc("Project")
	doc.project_name = project_name
	doc.company = resolve_company()
	doc.envision_enabled = 1

	markdown = (description or "").strip()
	if markdown:
		doc.envision_description = markdown
		doc.notes = str(md_to_html(markdown) or "")

	for user in [frappe.session.user, *member_users]:
		doc.append("users", {"user": user, "welcome_email_sent": 1})

	doc.insert()
	return {
		"name": doc.name,
		"project_name": doc.project_name,
		"members": [row.user for row in doc.users],
	}


@frappe.whitelist()
def list_invitable_users(search: str | None = None, limit: int = 50) -> list[dict]:
	"""Enabled desk users who can be invited to a project (everyone but the
	caller and the built-in accounts). Only project creators may call this."""
	require_project_creator()

	filters = {
		"enabled": 1,
		"user_type": "System User",
		"name": ["not in", [*SYSTEM_USERS, frappe.session.user]],
	}
	or_filters = None
	search = (search or "").strip()
	if search:
		like = f"%{search}%"
		or_filters = [["full_name", "like", like], ["name", "like", like]]

	return frappe.get_all(
		"User",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc",
		limit=min(int(limit or 50), 200),
	)


def require_project_creator() -> None:
	if not frappe.has_permission("Project", "create"):
		frappe.throw(_("You are not permitted to create projects."), frappe.PermissionError)


def parse_members(members: list[str] | str | None) -> list[str]:
	if not members:
		return []
	if isinstance(members, str):
		members = frappe.parse_json(members) if members.startswith("[") else [members]
	if not isinstance(members, list):
		frappe.throw(_("Members must be a list of user IDs."), frappe.ValidationError)

	seen: list[str] = []
	for user in members:
		user = (user or "").strip()
		if user and user != frappe.session.user and user not in seen:
			seen.append(user)
	return seen


def validate_members(users: list[str]) -> list[str]:
	if not users:
		return users
	valid = set(
		frappe.get_all(
			"User",
			filters={"name": ["in", users], "enabled": 1, "user_type": "System User"},
			pluck="name",
		)
	)
	unknown = [user for user in users if user not in valid]
	if unknown:
		frappe.throw(
			_("These users cannot be invited: {0}").format(", ".join(unknown)),
			frappe.ValidationError,
		)
	return users


def resolve_company() -> str:
	company = frappe.defaults.get_user_default("Company") or frappe.defaults.get_global_default("company")
	if company:
		return company
	companies = frappe.get_all("Company", pluck="name", limit=2)
	if len(companies) == 1:
		return companies[0]
	frappe.throw(_("Set a default Company before creating projects."), title=_("No default Company"))
