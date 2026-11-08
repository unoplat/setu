"""Task comments ↔ GitHub Issue comments (docs/adr/0008, comment sync).

Each synced comment has one Envision GitHub Comment Sync row: the Envision Comment's
name and its GitHub comment's id, kept until both copies are gone. A row whose
Comment was deleted holds that name until its GitHub copy is deleted too.

Envision → GitHub. The Comment hooks record ``comment:<Comment name>: push`` or
``delete`` on the Task's link, in the user's own transaction, like a Task field
(``links.record_entries``). Only a Task that is already published has a link, so
comments written before it published stay in Envision. ``push`` creates the GitHub
comment or edits it; ``delete`` deletes it.

GitHub has no idempotent comment create. The row is inserted with a random
``create_marker`` before the first create, and the GitHub copy carries it in a
hidden trailer, ``<!-- envision-comment:<marker> -->``. ``create_requested_at`` is
committed before the create is sent; an uncertain outcome looks for the marker on
the Issue, authored by this site's app bot, before it ever creates again.

GitHub → Envision. ``comment:<GitHub id>: sync`` re-reads the comment and creates or
updates its Envision Comment, as the integration user; ``delete`` deletes it.
``comments: sync`` reads every comment an Issue has, in the cron only. A comment
with Envision work pending is left alone: Envision wins, as for Task fields.

The GitHub copy of an Envision comment names its author and carries a reply's
quote, which Envision keeps outside the comment's own text:

    Posted by **Bob** in Envision.

    > **Alice** · 8 Nov 2026, 04:30 UTC
    >
    > Ship **Friday**.

    <!-- envision-reply -->

    Agreed.

    <!-- envision-comment:<marker> -->

Only what follows ``<!-- envision-reply -->`` comes back from an edit on GitHub. The
quote in Envision never changes (setu.api.timeline.validate_quote), and Envision's
next push of the comment puts GitHub's copy of it back. A GitHub comment's own quotes
(``> `` lines) arrive as ordinary block quotes in the Comment's text: GitHub has no
record of what a quote quotes. Mentions publish as the person's name, without ``@``,
so nobody on GitHub is notified by an Envision user's name.
"""

import re
import secrets
from datetime import datetime, timedelta

import frappe
from bs4 import BeautifulSoup
from bs4.element import NavigableString
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, get_fullname, now_datetime, sanitize_html

from setu.github import (
	bot,
	client,
	clock,
	connection,
	convert,
	delta,
	issues,
	link_state,
	links,
	projects,
	store,
)
from setu.github.client import GitHubError, JSONValue
from setu.github.issues import CommentData

COMMENT_SAVEPOINT = "envision_github_comment"
RESEND_AFTER = timedelta(minutes=10)
# Pages of 100 read when looking for a create whose reply was lost, and when
# importing an Issue's comments.
LOOKUP_PAGES = 30
IMPORT_PAGES = 100
# GitHub documents no comment limit separately; this is its Issue body limit.
MAX_BODY_LENGTH = convert.MAX_BODY_LENGTH
MISSING_STATUSES = frozenset({404, 410})
MAPPING_FIELDS = [
	"name",
	"issue_sync",
	"comment",
	"origin",
	"github_comment_id",
	"github_url",
	"author_login",
	"create_marker",
	"create_requested_at",
]
COMMENT_FIELDS = [
	"name",
	"comment_type",
	"reference_doctype",
	"reference_name",
	"owner",
	"comment_by",
	"content",
	"creation",
]
QUOTE_FIELDS = ["envision_quote_owner", "envision_quote_creation", "envision_quote_content"]
REPLY_START = "<!-- envision-reply -->"
TRAILER = re.compile(r"\s*<!-- envision-comment:([0-9a-f]{32}) -->\s*$")
MARKDOWN_SPECIAL = re.compile(r"([\\`*_\[\]<>#|~])")


# The rows.


def mapping_for_comment(comment_name: str) -> frappe._dict | None:
	return frappe.db.get_value(store.COMMENT_SYNC, {"comment": comment_name}, MAPPING_FIELDS, as_dict=True)


def mapping_for_remote(comment_id: str) -> frappe._dict | None:
	return frappe.db.get_value(
		store.COMMENT_SYNC, {"github_comment_id": comment_id}, MAPPING_FIELDS, as_dict=True
	)


def reserve(link_name: str, comment_name: str) -> frappe._dict:
	"""The Envision comment's row, inserted with its marker the first time."""
	store.insert_unique(
		{
			"doctype": store.COMMENT_SYNC,
			"issue_sync": link_name,
			"comment": comment_name,
			"origin": "Envision",
			"create_marker": secrets.token_hex(16),
		}
	)
	mapping = mapping_for_comment(comment_name)
	if not mapping:
		raise frappe.ValidationError(_("Envision could not record this comment's GitHub copy."))
	return mapping


# Comment hooks (setu/hooks.py).


def is_task_comment(doc: Document) -> bool:
	"""A comment someone wrote on a Task: not an Info line, assignment or the like."""
	return doc.comment_type == "Comment" and doc.reference_doctype == "Task" and bool(doc.reference_name)


def on_comment_insert(doc: Document, method: str | None = None) -> None:
	# A comment from GitHub is not sent back.
	if bot.inbound() or not is_task_comment(doc):
		return
	links.guarded(record_comment, doc.reference_name, doc.name, delta.PUSH)


def on_comment_update(doc: Document, method: str | None = None) -> None:
	if bot.inbound() or doc.flags.in_insert or not is_task_comment(doc):
		return
	if doc.get_doc_before_save() is None or not doc.has_value_changed("content"):
		return
	links.guarded(record_comment, doc.reference_name, doc.name, delta.PUSH)


def on_comment_trash(doc: Document, method: str | None = None) -> None:
	"""A comment deleted from GitHub has already lost its row, so it is not sent back."""
	if bot.inbound() or not is_task_comment(doc):
		return
	links.guarded(record_comment, doc.reference_name, doc.name, delta.DELETE)


def record_comment(task_name: str, comment_name: str, action: str) -> None:
	"""The comment's key on its Task's link. A Task with no link isn't published, and a
	marked link ignores edits (``links.record_entries``)."""
	link = links.link_for_task(task_name)
	if link:
		links.record_entries(link.name, task_name, link.project, {delta.comment_key(comment_name): action})


# Envision → GitHub (setu.github.outbound.push_key).


def push_order(resources: list[str]) -> list[str]:
	"""Task fields first, then comments in the order they were written, so GitHub shows
	them in that order too. A deleted Comment has no time left, and only deletes."""
	names = [
		resource.removeprefix(delta.COMMENT_PREFIX) for resource in resources if is_comment_key(resource)
	]
	created = (
		dict(
			frappe.get_all(
				"Comment", filters={"name": ["in", names]}, fields=["name", "creation"], as_list=True
			)
		)
		if names
		else {}
	)
	fields = [resource for resource in resources if not is_comment_key(resource)]
	keys = sorted(
		(created.get(resource.removeprefix(delta.COMMENT_PREFIX)) or datetime.max, resource)
		for resource in resources
		if is_comment_key(resource)
	)
	return [*fields, *(resource for _created, resource in keys)]


def is_comment_key(resource: str) -> bool:
	return resource.startswith(delta.COMMENT_PREFIX)


def push_comment(link: frappe._dict, found: links.Target, comment_name: str, action: str) -> None:
	"""One outbound comment key. Returning means it is done."""
	if action == delta.DELETE:
		delete_remote(link, found, comment_name)
		return
	comment = frappe.db.get_value("Comment", comment_name, COMMENT_FIELDS, as_dict=True)
	if not comment or comment.reference_name != link.task:
		# Deleted meanwhile: its delete key follows.
		return
	if not link.issue_number:
		raise GitHubError(_("This task's GitHub Issue has not been created yet."))
	mapping = mapping_for_comment(comment_name) or reserve(link.name, comment_name)
	if mapping.github_comment_id:
		edit_remote(found, mapping, comment)
		return
	ensure_created(link, found, mapping, comment)


def edit_remote(found: links.Target, mapping: frappe._dict, comment: frappe._dict) -> None:
	"""A comment deleted on GitHub is not created again: its delete event deletes it here."""
	try:
		issues.update_comment(
			found["installation_id"],
			found["full_name"],
			mapping.github_comment_id,
			comment_body(comment, mapping),
		)
	except GitHubError as exc:
		if exc.status not in MISSING_STATUSES:
			raise


def ensure_created(
	link: frappe._dict, found: links.Target, mapping: frappe._dict, comment: frappe._dict
) -> None:
	"""Find or create the GitHub comment and record it, or raise, which keeps the key."""
	if mapping.create_requested_at:
		started = get_datetime(mapping.create_requested_at)
		remote = find_created(link, found, mapping.create_marker)
		if remote:
			record_created(mapping.name, remote)
			return
		if now_datetime() - started < RESEND_AFTER:
			raise GitHubError(
				_("GitHub may have created this comment. Envision is checking before trying again.")
			)
	send_create(link, found, mapping, comment)


def send_create(
	link: frappe._dict, found: links.Target, mapping: frappe._dict, comment: frappe._dict
) -> None:
	"""Commit ``create_requested_at``, then POST. A failure that means it was definitely
	not created clears the time; an uncertain one keeps it for ``find_created``."""
	body = comment_body(comment, mapping)
	frappe.db.set_value(
		store.COMMENT_SYNC, mapping.name, "create_requested_at", now_datetime(), update_modified=False
	)
	frappe.db.commit()
	try:
		remote = issues.create_comment(found["installation_id"], found["full_name"], link.issue_number, body)
	except GitHubError as exc:
		if not exc.uncertain:
			frappe.db.set_value(
				store.COMMENT_SYNC, mapping.name, "create_requested_at", None, update_modified=False
			)
			frappe.db.commit()
		raise
	record_created(mapping.name, remote)


def record_created(mapping_name: str, remote: CommentData) -> None:
	"""Committed at once: a later key's failure rolls back the run, never this identity."""
	frappe.db.set_value(
		store.COMMENT_SYNC,
		mapping_name,
		{"github_comment_id": remote["id"], "github_url": remote["html_url"], "create_requested_at": None},
		update_modified=False,
	)
	frappe.db.commit()


def find_created(link: frappe._dict, found: links.Target, marker: str | None) -> CommentData | None:
	"""The comment this site's app created with ``marker`` on the link's Issue."""
	login = client.app_login()
	if not login or not marker:
		raise GitHubError("The GitHub App's name is not known. Refresh GitHub settings.", uncertain=True)
	for page in range(1, LOOKUP_PAGES + 1):
		result = issues.list_comments(found["installation_id"], found["full_name"], link.issue_number, page)
		for remote in result["comments"]:
			if written_by_app(remote, login) and trailer_marker(remote["body"]) == marker:
				return remote
		if not result["more"]:
			return None
	raise GitHubError(
		"Too many comments on this Issue to check for this one. Envision will check again.", uncertain=True
	)


def delete_remote(link: frappe._dict, found: links.Target, comment_name: str) -> None:
	"""Delete the GitHub copy, then the row. A create still uncertain is found first, so
	its copy is never left behind; one that never reached GitHub has nothing to delete."""
	mapping = mapping_for_comment(comment_name)
	if not mapping:
		return
	remote_id = mapping.github_comment_id
	if not remote_id and mapping.create_requested_at and link.issue_number:
		remote = find_created(link, found, mapping.create_marker)
		if remote:
			remote_id = remote["id"]
		elif now_datetime() - get_datetime(mapping.create_requested_at) < RESEND_AFTER:
			raise GitHubError(
				_("GitHub may have created this comment. Envision is checking before deleting it.")
			)
	if remote_id:
		try:
			issues.delete_comment(found["installation_id"], found["full_name"], remote_id)
		except GitHubError as exc:
			if exc.status not in MISSING_STATUSES:
				raise
	frappe.db.delete(store.COMMENT_SYNC, {"name": mapping.name})
	frappe.db.commit()


# Bodies.


def comment_body(comment: frappe._dict, mapping: frappe._dict) -> str:
	"""The GitHub body for a comment. A comment written on GitHub gets its text back
	as it is; one written in Envision gets its author, its quote and its marker."""
	text = markdown_for(comment.content)
	if mapping.origin == "GitHub":
		body = text
	else:
		parts = [attribution(comment)]
		quote = quote_markdown(comment.name)
		if quote:
			parts.append(quote)
		parts.append(REPLY_START)
		if text:
			parts.append(text)
		parts.append(f"<!-- envision-comment:{mapping.create_marker} -->")
		body = "\n\n".join(parts)
	if len(body) > MAX_BODY_LENGTH:
		raise GitHubError(_("This comment is too long for GitHub. Shorten it to sync it."))
	return body


def attribution(comment: frappe._dict) -> str:
	name = comment.comment_by or get_fullname(comment.owner)
	return _("Posted by **{0}** in Envision.").format(escape_markdown(name))


def quote_markdown(comment_name: str) -> str | None:
	"""A reply's quote as Envision froze it, never the quoted comment as it is now."""
	if not frappe.get_meta("Comment").has_field("envision_quote_owner"):
		return None
	quote = frappe.db.get_value("Comment", comment_name, QUOTE_FIELDS, as_dict=True)
	if not quote or not quote.envision_quote_owner:
		return None
	heading = f"**{escape_markdown(get_fullname(quote.envision_quote_owner))}**"
	if quote.envision_quote_creation:
		posted = clock.to_utc(quote.envision_quote_creation)
		heading += f" · {posted.day} {posted:%b %Y, %H:%M} UTC"
	lines = [heading, "", *markdown_for(quote.envision_quote_content).splitlines()]
	return "\n".join(f"> {line}" if line else ">" for line in lines)


def markdown_for(html: str | None) -> str:
	"""Comment HTML as GitHub Markdown. A conversion error fails the key: it shows and retries."""
	try:
		return convert.html_to_markdown(plain_mentions(html), site_url=site_url())["markdown"]
	except Exception as exc:
		raise GitHubError(
			_("Envision could not convert this comment for GitHub ({0}).").format(type(exc).__name__)
		) from exc


def plain_mentions(html: str | None) -> str:
	"""Each mention as the person's name, without ``@``: Envision users have no GitHub
	login to notify, and a name must not notify whoever has it as a login."""
	if not html or "mention" not in html:
		return html or ""
	soup = BeautifulSoup(html, "html.parser")
	for mention in soup.select("span.mention"):
		mention.replace_with(NavigableString(mention.get_text().strip().lstrip("@")))
	return str(soup)


def escape_markdown(text: str) -> str:
	return MARKDOWN_SPECIAL.sub(r"\\\1", text)


def site_url() -> str | None:
	try:
		return connection.public_url()
	except GitHubError:
		return None


def trailer_marker(body: str) -> str | None:
	match = TRAILER.search(body or "")
	return match.group(1) if match else None


def reply_markdown(body: str, origin: str) -> str:
	"""What an edit on GitHub changes in Envision: the whole body of a comment written
	there, and only the reply text of one written in Envision."""
	text = TRAILER.sub("", body or "")
	if origin == "Envision" and REPLY_START in text:
		text = text.split(REPLY_START, 1)[1]
	return text.strip()


def content_html(body: str, origin: str) -> str:
	html = convert.markdown_to_html(reply_markdown(body, origin))["html"]
	return html or "<p></p>"


def written_by_app(remote: CommentData, login: str | None) -> bool:
	return bool(login) and remote["author_type"] == "Bot" and remote["author_login"] == login


# GitHub → Envision (setu.github.inbound.apply_key).


def repository_row(target: dict[str, str | int]) -> frappe._dict:
	route = projects.route_for(repository=str(target["repository_id"]))
	blocker = projects.sync_blocker(route)
	if not route or blocker:
		raise frappe.ValidationError(projects.inactive_message(blocker or "not_connected"))
	return route["repository_row"]


def synced_link(target: dict[str, str | int]) -> frappe._dict | None:
	"""The Issue's link, if its comments sync: it holds a Task and has no mark."""
	link = links.link_for_issue(str(target["issue_id"]))
	if not link or not link.task or link.sync_state in link_state.MARKS:
		return None
	return link


def apply_comment(target: dict[str, str | int], comment_id: str, action: str) -> None:
	"""``comment:<id>``. An Issue with no link has nothing to sync to: one that imports
	does so in the run's ``issue`` key, before this one. A comment that reads as gone
	changes nothing: only its signed delete event deletes it here."""
	link = synced_link(target)
	if not link:
		return
	if action == delta.DELETE:
		delete_local(link, comment_id)
		return
	row = repository_row(target)
	try:
		remote = issues.get_comment(row.installation, row.full_name, comment_id)
	except GitHubError as exc:
		if exc.status in MISSING_STATUSES:
			return
		raise
	if remote["issue_number"] != int(target["issue_number"]):
		return
	apply_remote(link, remote, links.pending_keys(link.name))


def import_all(target: dict[str, str | int]) -> None:
	"""``comments: sync``: every comment the Issue has now, oldest first, each in its own
	savepoint. The first failure is raised after the rest, so the key retries; comments
	already there are matched by id, never imported twice."""
	link = synced_link(target)
	if not link:
		return
	row = repository_row(target)
	pending = links.pending_keys(link.name)
	first: Exception | None = None
	for page in range(1, IMPORT_PAGES + 1):
		result = issues.list_comments(row.installation, row.full_name, int(target["issue_number"]), page)
		for remote in result["comments"]:
			frappe.db.savepoint(COMMENT_SAVEPOINT)
			try:
				apply_remote(link, remote, pending)
			except Exception as exc:
				frappe.db.rollback(save_point=COMMENT_SAVEPOINT)
				first = first or exc
		if not result["more"]:
			break
	if first:
		raise first


def apply_remote(link: frappe._dict, remote: CommentData, pending: set[str]) -> None:
	"""Create or update the Envision copy of a GitHub comment."""
	mapping = mapping_for_remote(remote["id"])
	if not mapping and written_by_app(remote, client.app_login()):
		# This app's own comment: Envision's create, whose reply may have been lost.
		# Never imported as a new comment.
		mapping = fill_identity(link.name, trailer_marker(remote["body"]), remote["id"], remote["html_url"])
		if not mapping:
			return
	if not mapping:
		insert_local(link, remote)
		return
	if mapping.issue_sync != link.name or delta.comment_key(mapping.comment) in pending:
		# Envision's edit or delete is waiting to be pushed, and wins.
		return
	update_local(mapping, remote)


def fill_identity(link_name: str, marker: str | None, comment_id: str, url: str) -> frappe._dict | None:
	"""Envision's own comment: give the marker's row its GitHub id, if it has none yet,
	so a create whose reply was lost finds it there. Never replaces an id."""
	if not marker:
		return None
	name = frappe.db.get_value(
		store.COMMENT_SYNC, {"create_marker": marker, "issue_sync": link_name, "origin": "Envision"}, "name"
	)
	mapping = (
		frappe.db.get_value(store.COMMENT_SYNC, name, MAPPING_FIELDS, as_dict=True, for_update=True)
		if name
		else None
	)
	if not mapping:
		return None
	if not mapping.github_comment_id:
		frappe.db.set_value(
			store.COMMENT_SYNC,
			mapping.name,
			{"github_comment_id": comment_id, "github_url": url, "create_requested_at": None},
			update_modified=False,
		)
		mapping.github_comment_id = comment_id
	return mapping if mapping.github_comment_id == comment_id else None


def insert_local(link: frappe._dict, remote: CommentData) -> None:
	"""The normal Comment insert as the integration user, dated when it was written on
	GitHub so history reads in order. Its author is the row's ``author_login``."""
	login = remote["author_login"]
	with bot.as_bot():
		comment = frappe.get_doc(
			{
				"doctype": "Comment",
				"comment_type": "Comment",
				"reference_doctype": "Task",
				"reference_name": link.task,
				"comment_email": bot.BOT_USER,
				"comment_by": f"@{login}" if login else _("GitHub"),
				"content": content_html(remote["body"], "GitHub"),
			}
		)
		comment.insert(ignore_permissions=True)
	created = clock.parse(remote["created_at"])
	if created:
		frappe.db.set_value(
			"Comment", comment.name, "creation", clock.to_site(created), update_modified=False
		)
	name = store.insert_unique(
		{
			"doctype": store.COMMENT_SYNC,
			"issue_sync": link.name,
			"comment": comment.name,
			"origin": "GitHub",
			"github_comment_id": remote["id"],
			"github_url": remote["html_url"],
			"author_login": login or None,
		}
	)
	if not name:
		raise frappe.ValidationError(_("Another sync imported this GitHub comment first."))


def update_local(mapping: frappe._dict, remote: CommentData) -> None:
	"""GitHub's current text, through the normal save. An unchanged one writes nothing."""
	if not frappe.db.exists("Comment", mapping.comment):
		return
	html = content_html(remote["body"], mapping.origin)
	with bot.as_bot():
		comment = frappe.get_doc("Comment", mapping.comment)
		if convert.html_digest(comment.content) == convert.html_digest(sanitize_html(html)):
			return
		comment.content = html
		comment.save(ignore_permissions=True)


def delete_local(link: frappe._dict, comment_id: str) -> None:
	"""A signed delete: the Envision copy and its row go. A reply quoting it keeps its quote
	(setu.api.timeline.release_quotes). Already gone is done."""
	mapping = mapping_for_remote(comment_id)
	if not mapping or mapping.issue_sync != link.name:
		return
	if frappe.db.exists("Comment", mapping.comment):
		with bot.as_bot():
			frappe.delete_doc("Comment", mapping.comment, ignore_permissions=True)
	frappe.db.delete(store.COMMENT_SYNC, {"name": mapping.name})


# The webhook (setu.github.events).


def fill_created(link_name: str, payload_comment: JSONValue) -> bool:
	"""This app's own issue_comment.created: give its row the GitHub id if the create
	hasn't recorded one yet. Whether a row was found."""
	if not isinstance(payload_comment, dict):
		return False
	body, comment_id, url = (
		payload_comment.get("body"),
		payload_comment.get("id"),
		payload_comment.get("html_url"),
	)
	if not isinstance(body, str) or not isinstance(comment_id, int) or not isinstance(url, str):
		return False
	return fill_identity(link_name, trailer_marker(body), str(comment_id), url) is not None
