"""The site's private GitHub App: manifest registration, installation, and repository discovery."""

import hashlib
import re
import secrets
import time
from urllib.parse import urlencode, urlsplit

import frappe
from frappe import _
from frappe.utils import now_datetime
from frappe.utils.password import remove_encrypted_password
from githubkit_schemas.v2022_11_28.models import Installation, SimpleUser

from setu.github import client, issues, store
from setu.github.client import GitHubError

INSTALLATION = "Envision GitHub Installation"
REPOSITORY = "Envision GitHub Repository"
DELIVERY = "Envision GitHub Delivery"
PROJECT_ROUTE = "Envision GitHub Project Settings"
STATE_TTL = 3600
CALLBACK_PATH = "/api/method/setu.api.github."
# Webhook events Issue sync needs. Apps registered before sub_issues was added
# must subscribe to it on GitHub (docs/github-connection.md).
REQUIRED_EVENTS = ("issues", "sub_issues")


def connection_lock(timeout: int = 660, blocking_timeout: int = 10):
	"""One Redis lock for every connection or routing mutation. Holders commit
	BEFORE leaving the block, so the next holder sees the committed state."""
	return frappe.cache.lock(
		frappe.cache.make_key("envision:github:connection"),
		timeout=timeout,
		blocking_timeout=blocking_timeout,
	)


def is_manager() -> bool:
	return frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles()


def require_manager():
	if frappe.session.user == "Guest" or not is_manager():
		frappe.throw(_("Only a System Manager can manage the GitHub connection."), frappe.PermissionError)


def public_url() -> str:
	# Explicit configuration is necessary behind a tunnel/reverse proxy: the Host header
	# may be internal, and must not control where app secrets are redirected.
	value = (frappe.conf.get("host_name") or "").rstrip("/")
	parsed = urlsplit(value)
	if (
		parsed.scheme != "https"
		or not parsed.hostname
		or parsed.username
		or parsed.password
		or parsed.path
		or parsed.query
		or parsed.fragment
	):
		raise GitHubError("Set this site's host_name to its public HTTPS base URL (without /envision) first.")
	return value


def site_binding() -> str:
	"""This site and database. A restored copy under another site or database
	name differs, so it pauses instead of competing with the original."""
	return hashlib.sha256(f"{frappe.local.site}:{frappe.conf.db_name}".encode()).hexdigest()


def binding_changed(doc=None) -> bool:
	doc = doc or client.settings()
	return bool(doc.app_id and doc.site_binding and doc.site_binding != site_binding())


def require_current_site():
	doc = client.settings()
	if not doc.app_id:
		raise GitHubError("Connect a GitHub App first.")
	if binding_changed(doc):
		raise GitHubError(
			"This site looks like a copy of the site that connected GitHub. Confirm it in Settings first."
		)
	if doc.site_url_at_creation != public_url():
		raise GitHubError(
			"The site URL changed. Update the GitHub App setup URL and confirm the new address in Settings."
		)
	return doc


def new_state(purpose: str, **values) -> str:
	state = secrets.token_urlsafe(32)
	frappe.cache.set_value(
		f"envision:github:state:{state}",
		{
			"user": frappe.session.user,
			"purpose": purpose,
			"site_url": public_url(),
			"expires_at": time.time() + STATE_TTL,
			**values,
		},
		expires_in_sec=STATE_TTL,
	)
	return state


def take_state(state: str | None, purpose: str) -> dict:
	if not state or not re.fullmatch(r"[A-Za-z0-9_-]{40,100}", state):
		raise GitHubError("The GitHub connection attempt expired. Start again from Settings.")
	key = f"envision:github:state:{state}"
	with frappe.cache.lock(frappe.cache.make_key(f"{key}:lock"), timeout=10, blocking_timeout=5):
		value = frappe.cache.get_value(key, use_local_cache=False)
		if (
			not value
			or value.get("user") != frappe.session.user
			or value.get("purpose") != purpose
			or value.get("site_url") != public_url()
		):
			raise GitHubError(
				"The GitHub connection attempt expired or belongs to another session. Start again."
			)
		frappe.cache.delete_value(key)
	return value


def start_app_creation(owner_type: str, organization: str = "") -> dict:
	require_manager()
	if client.settings().app_id:
		raise GitHubError("This site already has a GitHub App. Install that app or disconnect it first.")
	if owner_type not in ("Organization", "User"):
		raise GitHubError("Choose an organization or personal account.")
	organization = (organization or "").strip()
	if owner_type == "Organization" and not re.fullmatch(
		r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", organization
	):
		raise GitHubError("Enter a valid GitHub organization login.")
	base = public_url()
	state = new_state("manifest", owner_type=owner_type, organization=organization)
	suffix = (
		f"organizations/{organization}/settings/apps/new"
		if owner_type == "Organization"
		else "settings/apps/new"
	)
	return {
		"url": f"https://github.com/{suffix}?{urlencode({'state': state})}",
		"manifest": {
			"name": f"Envision {urlsplit(base).hostname.split('.')[0]}"[:34],
			"url": f"{base}/envision",
			"description": "Connects Envision Tasks to GitHub Issues.",
			"hook_attributes": {"url": f"{base}{CALLBACK_PATH}webhook", "active": True},
			"redirect_url": f"{base}{CALLBACK_PATH}manifest_callback",
			"setup_url": f"{base}{CALLBACK_PATH}setup_callback",
			"setup_on_update": True,
			"request_oauth_on_install": False,
			"public": False,
			"default_permissions": {"metadata": "read", "issues": "write"},
			"default_events": list(REQUIRED_EVENTS),
		},
	}


def complete_manifest(code: str, state: str) -> str:
	require_manager()
	if not code or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", code):
		raise GitHubError("GitHub did not return a valid registration code.")
	# Prevent two tabs from replacing an app and orphaning its credentials.
	with connection_lock(timeout=120, blocking_timeout=5):
		doc = client.settings()
		if doc.app_id:
			raise GitHubError("This site already has a GitHub App. Return to Settings.")
		# Only consume state once the connection lock is held. If transport
		# fails, allow a retry within the ORIGINAL expiry; never extend it.
		context = take_state(state, "manifest")
		try:
			github = client.unauthenticated_client()
			response = client.app_write(github.rest(client.API_VERSION).apps.create_from_manifest, code)
			# The one-time credentials must survive schema changes; parsing also drops public.
			try:
				result = response.json()
			except ValueError:
				raise GitHubError(client.INVALID, uncertain=True) from None
			if not isinstance(result, dict):
				raise GitHubError(client.INVALID, uncertain=True)
		except GitHubError as exc:
			remaining = int(context.get("expires_at", 0) - time.time())
			if exc.status is None and remaining > 0:
				frappe.cache.set_value(f"envision:github:state:{state}", context, expires_in_sec=remaining)
			raise
		owner = result.get("owner") or {}
		owner_login = owner.get("login") if isinstance(owner, dict) else None
		if (
			not all(result.get(key) for key in ("id", "slug", "client_id", "pem", "webhook_secret"))
			or not isinstance(owner, dict)
			or owner.get("type") != context["owner_type"]
			or not owner.get("id")
			or not isinstance(owner_login, str)
			or not owner_login
			or (
				context["owner_type"] == "Organization"
				and owner_login.casefold() != context["organization"].casefold()
			)
			or result.get("public") is True
		):
			raise GitHubError(
				"GitHub returned an unexpected app registration. Check the app owner on GitHub."
			)
		doc.update(
			{
				"app_id": str(result["id"]),
				"app_slug": result.get("slug"),
				"client_id": result["client_id"],
				"client_secret": result.get("client_secret"),
				"private_key": result["pem"],
				"webhook_secret": result["webhook_secret"],
				"owner_login": owner_login,
				"owner_id": str(owner["id"]),
				"owner_type": owner.get("type"),
				"site_url_at_creation": public_url(),
				"site_binding": site_binding(),
				# The conversion returns the registered app, events included.
				"subscribed_events": "\n".join(
					sorted(event for event in result.get("events") or [] if isinstance(event, str))
				),
				"connected_by": frappe.session.user,
				"connected_on": now_datetime(),
			}
		)
		doc.save(ignore_permissions=True)
		# GET callbacks are not auto-committed by Frappe. Keep the one-time
		# credentials even if preparing the subsequent installation URL fails.
		frappe.db.commit()
	return install_url()


def install_url() -> str:
	require_manager()
	doc = require_current_site()
	state = new_state("installation", app_id=doc.app_id)
	return f"https://github.com/apps/{doc.app_slug}/installations/new?{urlencode({'state': state})}"


def complete_installation(installation_id: str | None, state: str | None, setup_action: str | None) -> str:
	require_manager()
	doc = require_current_site()
	if state:
		context = take_state(state, "installation")
		if context.get("app_id") != doc.app_id:
			raise GitHubError("This installation attempt belongs to a different GitHub App.")
		if setup_action == "request":
			return "pending"
	elif setup_action in ("install", "request"):
		# GitHub-originated installs/approval requests need not have our state.
		# Do not attach the supplied ID; a verified webhook or Refresh will sync.
		return "pending"
	elif setup_action != "update":
		raise GitHubError("Start the GitHub installation from Envision Settings.")
	# A state-less update only refreshes an already-known installation. Never
	# trust the URL's ID to attach a new installation to the site.
	elif not frappe.db.exists(INSTALLATION, {"name": installation_id, "removed": 0}):
		raise GitHubError("Refresh this connection from Envision Settings.")
	sync_installation(installation_id)
	frappe.db.commit()
	return "connected"


def valid_installation(installation: Installation) -> SimpleUser:
	"""The installation's account, if it belongs to this site's app and owner."""
	doc = client.settings()
	account = installation.account
	if (
		str(installation.app_id) != doc.app_id
		or not isinstance(account, SimpleUser)
		or str(account.id) != doc.owner_id
	):
		raise GitHubError("This installation does not belong to this site's GitHub App and owner.")
	return account


def sync_installation(installation_id: str):
	installation_id = str(installation_id)
	if not re.fullmatch(r"\d{1,30}", installation_id):
		raise GitHubError("Invalid GitHub installation ID.")
	require_current_site()
	github = client.installation_client(installation_id)
	installation = client.app_call(
		github.rest(client.API_VERSION).apps.get_installation, int(installation_id)
	)
	account = valid_installation(installation)
	values = {
		"account_login": account.login,
		"account_id": str(account.id),
		"account_type": account.type,
		"repository_selection": installation.repository_selection,
		"suspended": bool(installation.suspended_at),
		"removed": 0,
		"permissions": installation.permissions.model_dump_json(exclude_unset=True),
		"last_synced_at": now_datetime(),
	}
	upsert(INSTALLATION, installation_id, values)
	# Permissions may have changed: this process's next token is minted fresh.
	client.clear_tokens()
	if values["suspended"]:
		mark_repositories_unavailable(installation_id)
		return
	if installation.permissions.issues != "write":
		raise GitHubError("Grant this app Issues read/write permission on GitHub before continuing.")
	# Fetch all pages before removing anything: a partial API failure must not
	# falsely mark repositories as removed. No untrusted pagination URL is used.
	repositories = []
	page = 1
	while True:
		batch = client.installation_call(
			installation_id,
			github.rest(client.API_VERSION).apps.list_repos_accessible_to_installation,
			per_page=100,
			page=page,
		).repositories
		repositories.extend(batch)
		if len(batch) < 100:
			break
		page += 1
	mark_repositories_unavailable(installation_id)
	for repository in repositories:
		upsert(
			REPOSITORY,
			str(repository.id),
			{
				"full_name": repository.full_name,
				"installation": installation_id,
				"html_url": f"https://github.com/{repository.full_name}",
				"private": repository.private,
				"archived": repository.archived,
				"has_issues": repository.has_issues,
				"available": 1,
			},
		)


def upsert(doctype: str, name: str, values: dict):
	if frappe.db.exists(doctype, name):
		doc = frappe.get_doc(doctype, name)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc({"doctype": doctype, "name": name, **values}).insert(ignore_permissions=True)


def mark_repositories_unavailable(installation_id: str):
	frappe.db.set_value(REPOSITORY, {"installation": installation_id}, "available", 0)


def remove_installation(installation_id: str):
	if frappe.db.exists(INSTALLATION, installation_id):
		frappe.db.set_value(INSTALLATION, installation_id, "removed", 1)
		mark_repositories_unavailable(installation_id)
		client.clear_tokens()


def refresh_app_events() -> None:
	"""Record the webhook events the app is subscribed to on GitHub. Only the
	GitHub UI can change them; Settings warns while one is missing."""
	doc = client.settings()
	try:
		events = issues.subscribed_events()
	except GitHubError:
		# Repository refresh still matters more; the last known list stays.
		return
	doc.subscribed_events = "\n".join(events)
	doc.save(ignore_permissions=True)


def missing_events(doc=None) -> list[str]:
	doc = doc or client.settings()
	if not doc.app_id:
		return []
	subscribed = set((doc.subscribed_events or "").split())
	return [event for event in REQUIRED_EVENTS if event not in subscribed]


def refresh_installations():
	require_current_site()
	refresh_app_events()
	github = client.app_client()
	seen = set()
	page = 1
	while True:
		batch = client.app_call(
			github.rest(client.API_VERSION).apps.list_installations, per_page=100, page=page
		)
		for installation in batch:
			valid_installation(installation)
			installation_id = str(installation.id)
			sync_installation(installation_id)
			seen.add(installation_id)
		if len(batch) < 100:
			break
		page += 1
	for installation_id in frappe.get_all(INSTALLATION, filters={"removed": 0}, pluck="name"):
		if installation_id not in seen:
			remove_installation(installation_id)


def rebind_site():
	"""Admin confirms the manual setup URL change, or that this site (a moved
	or restored copy) now owns the integration; update the API-editable webhook too.

	Confirming a copy makes it the only writer: the original site must be
	disconnected or retired first (docs/github-connection.md)."""
	require_manager()
	doc = client.settings()
	if not doc.app_id:
		raise GitHubError("Connect a GitHub App first.")
	base = public_url()
	github = client.app_client()
	client.app_write(
		github.rest(client.API_VERSION).apps.update_webhook_config_for_app,
		data={"url": f"{base}{CALLBACK_PATH}webhook"},
	)
	doc.site_url_at_creation = base
	doc.site_binding = site_binding()
	doc.save(ignore_permissions=True)


def disconnect():
	"""Uninstall remotely before discarding local secrets. Failure leaves credentials intact.

	Issue links are kept, paused (``app_disconnected``): Tasks keep their Issue
	identity and tombstones, and nothing is deleted on either side. Connecting
	again and turning sync on for the same repository resumes them after a
	fresh comparison."""
	require_manager()
	require_current_site()
	for installation_id in frappe.get_all(INSTALLATION, filters={"removed": 0}, pluck="name"):
		# Built per installation: with none left, a missing or broken key must
		# not stop the local credentials from being discarded.
		github = client.app_client()
		try:
			client.app_write(github.rest(client.API_VERSION).apps.delete_installation, int(installation_id))
		except GitHubError as exc:
			if exc.status != 404:
				raise
		remove_installation(installation_id)
	doc = client.settings()
	for field in doc.meta.fields:
		if field.fieldtype == "Password":
			remove_encrypted_password(client.SETTINGS, client.SETTINGS, field.fieldname)
		doc.set(field.fieldname, None)
	doc.save(ignore_permissions=True)
	# Project routes link to repositories, and this bulk delete bypasses link
	# checks. Lock every repository row first so an in-flight route insert
	# (which locks its repository row) either commits before this delete sees it,
	# or waits and then finds its repository gone.
	repository = frappe.qb.DocType(REPOSITORY)
	frappe.qb.from_(repository).select(repository.name).for_update().run()
	# Links store the repository ID as plain data, so they outlive the catalog.
	store.pause_links({}, "app_disconnected")
	frappe.db.delete(PROJECT_ROUTE)
	# Keep receipt metadata for diagnostics; stale jobs compare their app ID.
	frappe.db.delete(REPOSITORY)
	frappe.db.delete(INSTALLATION)


def get_connection() -> dict:
	if not is_manager():
		return {"can_manage": False}
	doc = client.settings()
	try:
		base = public_url()
		configuration_error = None
	except GitHubError as exc:
		base = None
		configuration_error = str(exc)
	installations = frappe.get_all(
		INSTALLATION,
		fields=["name", "account_login", "suspended", "removed", "last_synced_at"],
		order_by="creation asc",
	)
	repositories = frappe.get_all(
		REPOSITORY,
		fields=["name", "full_name", "html_url", "private", "archived", "has_issues", "available"],
		order_by="full_name asc",
	)
	last = frappe.get_all(
		DELIVERY,
		filters={"app_id": doc.app_id} if doc.app_id else {"app_id": ""},
		fields=["name", "event", "action", "status", "error", "creation"],
		order_by="creation desc",
		limit_page_length=1,
	)
	return {
		"can_manage": True,
		"configured": bool(doc.app_id),
		"app_slug": doc.app_slug,
		"owner_login": doc.owner_login,
		"public_url": base,
		"registered_url": doc.site_url_at_creation,
		"url_changed": bool(doc.app_id and base != doc.site_url_at_creation),
		"configuration_error": configuration_error,
		"installations": installations,
		"repositories": repositories,
		"last_delivery": last[0] if last else None,
		# Disconnect removes these routes and pauses these links.
		"project_routes": frappe.db.count(PROJECT_ROUTE),
		"sync_links": frappe.db.count(store.ISSUE_SYNC, {"sync_state": ["in", list(store.ACTIVE_STATES)]}),
		"binding_changed": binding_changed(doc),
		"missing_events": missing_events(doc),
		"callback_urls": {
			"redirect": f"{base}{CALLBACK_PATH}manifest_callback" if base else None,
			"setup": f"{base}{CALLBACK_PATH}setup_callback" if base else None,
			"webhook": f"{base}{CALLBACK_PATH}webhook" if base else None,
		},
	}
