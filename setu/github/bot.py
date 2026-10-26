"""The GitHub integration user that Task changes from GitHub are attributed to.

Changes from GitHub are saved as this user, not as whoever triggered the job,
and the GitHub actor is named in the Task's Activity. The user is disabled,
has no roles and no password, so nobody can sign in as it; saves made as it
pass ``ignore_permissions`` but still run every Task validation.
"""

from collections.abc import Iterator
from contextlib import contextmanager

import frappe

BOT_USER = "envision-github@bot.invalid"
# Set while a GitHub change is being saved, so the Task hooks do not send the
# same change straight back to GitHub.
INBOUND_FLAG = "envision_github_inbound"


def ensure_bot_user() -> None:
	"""after_install and after_migrate: create the user once, never alter it."""
	if frappe.db.exists("User", BOT_USER):
		return
	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": BOT_USER,
			"first_name": "GitHub",
			"enabled": 0,
			"send_welcome_email": 0,
			"user_type": "Website User",
		}
	)
	user.flags.no_welcome_mail = True
	user.insert(ignore_permissions=True)


def inbound() -> bool:
	return bool(frappe.flags.get(INBOUND_FLAG))


@contextmanager
def as_bot() -> Iterator[None]:
	"""Run Task saves as the integration user, then restore the session."""
	previous_user = frappe.session.user
	previous_flag = frappe.flags.get(INBOUND_FLAG)
	ensure_bot_user()
	frappe.set_user(BOT_USER)
	frappe.flags[INBOUND_FLAG] = True
	try:
		yield
	finally:
		frappe.flags[INBOUND_FLAG] = previous_flag
		frappe.set_user(previous_user)
