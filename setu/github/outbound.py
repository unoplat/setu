"""Envision → GitHub: the push job, and creating a Task's Issue safely (docs/adr/0008).

``push_task_delta`` holds the per-link Redis lock for one run. From
``frappe.enqueue`` it works through link.delta: finished keys leave it, and on
failure what is left moves to the link's Retry Job. From the retry cron it
applies the keys it is given and says which finished, and the cron owns the row.
No database row lock is held across a GitHub request.

Each key pushes the Task's current value, so a repeat push is idempotent. All
delta values are ``push``, so a value can't show a merge during a run: the job
compares the link's ``modified`` instead. Only a Task hook's write changes it;
everything here writes with ``update_modified=False``.

GitHub has no idempotent Issue create. An Issue Envision creates carries its
Task's name as a marker, ``<!-- envision:<Task name> -->``, a hidden HTML
comment in the Issue body. Task names repeat across sites and anyone can copy
a body, so the marker only counts together with this site's app bot as author.
``create_requested_at`` is committed BEFORE the create is sent. If the outcome
is then unknown (a timeout, a dropped connection, a server error, or a worker
that died mid-request), the next run first looks for that Issue, and creates
again only if it is still not found ``RESEND_AFTER`` later.

``issue: delete`` deletes the link's Issue. A job that finishes it removes the
link row itself; from the cron it only reports the key done, and the row's on-done
hook removes the link (``links.mark_synced``).
"""

from collections.abc import Callable
from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime
from githubkit_schemas.v2022_11_28.types import ReposOwnerRepoIssuesIssueNumberPatchBodyType
from redis.exceptions import LockError

from setu.github import (
	client,
	clock,
	comments,
	connection,
	convert,
	delta,
	issues,
	link_state,
	links,
	projects,
	retry,
	store,
	titles,
)
from setu.github.client import GitHubError
from setu.github.convert import IssueBody
from setu.github.issues import IssueData
from setu.retry_jobs import HandlerResult

RESEND_AFTER = timedelta(minutes=10)
LOOKUP_PAGES = 5
# GitHub's title limit, in characters.
MAX_TITLE_LENGTH = 256
# (site, repository) pairs whose Envision label this process saw or created.
LABELLED: set[tuple[str, str]] = set()
# links.target's reasons that mean Project sync is off: the job stops, not a
# failure, and the keys stay. Turning sync on removes a link routed elsewhere.
SYNC_OFF = frozenset({"not_connected", "sync_not_enabled", "app_not_connected", "destination_changed"})
PUSH_FIELDS = [
	*links.STATE_FIELDS,
	"project",
	"origin",
	"create_requested_at",
	"issue_node_id",
	"issue_number",
]


def push_task_delta(target: dict[str, str | int], entries: dict[str, str] | None = None) -> HandlerResult:
	"""Retry Job handler and background job for one link. A busy lock finishes nothing."""
	link_name = str(target["link"])
	if entries is None:
		return locked_job(link_name)
	return locked_cron(link_name, entries)


def locked_job(link_name: str) -> HandlerResult:
	"""The job waits for the lock, then runs again later rather than leave keys with
	nothing queued. The wait stays blocking: enqueuing again at once would spin
	workers on a lock that can be held for minutes, and the wait paces the retries."""
	try:
		with store.link_lock(link_name):
			return run_job(link_name)
	except LockError:
		enqueue_again(link_name)
		return HandlerResult(frozenset())


def locked_cron(link_name: str, entries: dict[str, str]) -> HandlerResult:
	"""The cron never waits for a lock: its row is still there on the next pass."""
	try:
		with store.link_lock_nowait(link_name):
			return run_cron(link_name, entries)
	except LockError:
		return HandlerResult(frozenset())


def enqueue_again(link_name: str) -> None:
	link = read_link(link_name)
	if link and delta.parse_delta(link.delta):
		links.enqueue_push(link_name, link.task or link_name, rerun=True)
		frappe.db.commit()


def read_link(link_name: str, *, for_update: bool = False) -> frappe._dict | None:
	return frappe.db.get_value(store.ISSUE_SYNC, link_name, PUSH_FIELDS, as_dict=True, for_update=for_update)


def run_job(link_name: str) -> HandlerResult:
	"""Background job mode: link.delta is the work.

	Copied under the row lock, which waits for a hook's merge still in its user's
	transaction: that hook's enqueue may have been deduplicated against this job
	while it was queued, so this read has to see its keys.
	"""
	link = read_link(link_name, for_update=True)
	frappe.db.commit()
	if not link:
		return HandlerResult(frozenset())
	copied = delta.parse_delta(link.delta) or {}
	if not copied:
		links.settle(link_name)
		frappe.db.commit()
		return HandlerResult(frozenset())
	done: set[str] = set()
	try:
		if not apply_all(link, copied, done):
			return HandlerResult(frozenset())
	except Exception as exc:
		frappe.db.rollback()
		left_finished(link_name, copied, done, link.modified)
		return HandlerResult(
			frozenset(done), error=move_to_retry_job(link_name, exc), rate_limited=is_rate_limited(exc)
		)
	# A fresh read: this transaction's snapshot is as old as the pushes.
	frappe.db.commit()
	if copied.get(delta.ISSUE_RESOURCE) == delta.DELETE:
		finish_delete(link_name)
		return HandlerResult(frozenset(done))
	if left_finished(link_name, copied, done, link.modified):
		links.enqueue_push(link_name, link.task or link_name, rerun=True)
	links.settle(link_name)
	frappe.db.commit()
	return HandlerResult(frozenset(done))


def run_cron(link_name: str, entries: dict[str, str]) -> HandlerResult:
	"""Cron mode: ``entries`` is the work, and the cron owns the Retry Job row. A
	link that has gone or is unlinked has nothing left to do, so its keys finish."""
	link = read_link(link_name)
	if not link or link.sync_state == link_state.UNLINKED:
		return HandlerResult(frozenset(entries))
	done: set[str] = set()
	try:
		if not apply_all(link, entries, done):
			return HandlerResult(frozenset())
	except Exception as exc:
		frappe.db.rollback()
		if is_rate_limited(exc):
			return HandlerResult(frozenset(done), rate_limited=True)
		error = retry.log_failure(exc, link_name)
		frappe.db.commit()
		return HandlerResult(frozenset(done), error=error)
	frappe.db.commit()
	return HandlerResult(frozenset(done))


def move_to_retry_job(link_name: str, exc: BaseException) -> str | None:
	"""Failure: to Retry Job. link.delta moves to the row's delta and is cleared, the
	link settles (cron_sync, or its mark), the Error Log goes on the row, and all of
	it commits. The caller rolls back its own failed work first.

	Returns the Error Log's name. A link that has gone meanwhile writes no row.
	"""
	error_log = retry.log_failure(exc, link_name)
	link = links.locked_link(link_name)
	if link:
		entries = delta.parse_delta(link.delta) or {}
		if entries:
			retry.upsert_task_job(link_name, links.job_task_name(link), entries, error_log)
			frappe.db.set_value(store.ISSUE_SYNC, link_name, "delta", None, update_modified=False)
		links.settle(link_name)
	frappe.db.commit()
	return error_log


def is_rate_limited(exc: Exception) -> bool:
	return isinstance(exc, GitHubError) and exc.rate_limited


def apply_all(link: frappe._dict, entries: dict[str, str], done: set[str]) -> bool:
	"""Pass the gates and apply ``entries``, adding what finishes to ``done`` as it
	goes, so a failure still reports it. False when Project sync is off.

	Raises the first failure once the other keys have had their turn.
	"""
	found = open_gates(link)
	if not found:
		return False
	apply_entries(link, found, entries, done)
	return True


def open_gates(link: frappe._dict) -> links.Target | None:
	"""The link's repository, or None when Project sync is off.

	Raises when the site binding is unconfirmed, or the route can't carry Issues
	now, or the installation is rate limited: those wait in the Retry Job.
	"""
	found, blocker = links.target(link)
	if blocker in SYNC_OFF:
		return None
	if blocker or not found:
		raise GitHubError(projects.inactive_message(blocker or "not_connected"))
	until = client.backoff_until(found["installation_id"])
	if until:
		raise GitHubError(client.RATE_LIMITED, 429, retry_at=until, rate_limited=True)
	return found


def apply_entries(link: frappe._dict, found: links.Target, entries: dict[str, str], done: set[str]) -> None:
	"""``issue: create`` runs before every other key, which need its Issue."""
	action = entries.get(delta.ISSUE_RESOURCE)
	if action == delta.DELETE:
		delete_issue(link, found)
		done.add(delta.ISSUE_RESOURCE)
		return
	if not link.task:
		# The Task went: nothing is left to send for it.
		done.update(entries)
		return
	task = frappe.get_doc("Task", link.task)
	if action == delta.CREATE:
		ensure_created(link, task, found)
		done.add(delta.ISSUE_RESOURCE)
	keys = {resource: value for resource, value in entries.items() if resource != delta.ISSUE_RESOURCE}
	if not keys:
		return
	# Read again: the create just gave the link its Issue.
	current = read_link(link.name)
	if not current:
		done.update(keys)
		return
	push_keys(current, task, found, keys, done)


def push_keys(
	link: frappe._dict, task: Document, found: links.Target, keys: dict[str, str], done: set[str]
) -> None:
	"""Push the Task's current value for each key, adding what finishes to ``done``.
	A comment key acts on its comment, as its action says (setu.github.comments).

	One failing key never blocks the others: the first failure is raised after them,
	so the Error Log has its real cause. A rate limit stops at once, because no
	other key could be sent either, and it must not count as an attempt.
	"""
	first: Exception | None = None
	for resource in comments.push_order(list(keys)):
		try:
			push_key(resource, keys[resource], link, task, found)
		except Exception as exc:
			if is_rate_limited(exc):
				raise
			first = first or exc
		else:
			done.add(resource)
	if first:
		raise first


def push_key(resource: str, action: str, link: frappe._dict, task: Document, found: links.Target) -> None:
	if comments.is_comment_key(resource):
		comments.push_comment(link, found, resource.removeprefix(delta.COMMENT_PREFIX), action)
		return
	pusher = PUSHERS.get(resource)
	if not pusher:
		raise GitHubError(_("Envision can't push {0} to GitHub.").format(resource))
	if not link.issue_number:
		raise GitHubError(_("This task's GitHub Issue has not been created yet."))
	pusher(link, task, found)


def patch_issue(
	link: frappe._dict, found: links.Target, patch: ReposOwnerRepoIssuesIssueNumberPatchBodyType
) -> None:
	issues.update_issue(found["installation_id"], found["full_name"], link.issue_number, patch)


def push_title(link: frappe._dict, task: Document, found: links.Target) -> None:
	patch_issue(link, found, {"title": whole_title(task)})


def push_description(link: frappe._dict, task: Document, found: links.Target) -> None:
	"""The only key that sends the body, and it replaces the whole body."""
	patch_issue(link, found, {"body": description_body(issue_marker(link), task)})


def push_status(link: frappe._dict, task: Document, found: links.Target) -> None:
	patch_issue(link, found, issues.state_patch(task.status))


def push_parent(link: frappe._dict, task: Document, found: links.Target) -> None:
	"""Add the Issue under its parent's Issue, or remove it from the parent it has.
	GitHub's own limits on sub-issues fail the key like any other refusal."""
	wanted = parent_issue_number(link, task)
	issue = issues.get_issue(found["installation_id"], found["full_name"], link.issue_number)
	under_wanted = (
		issue["parent_number"] == wanted
		and (issue["parent_full_name"] or "").lower() == found["full_name"].lower()
	)
	if wanted and not under_wanted:
		# Moves it if it has another parent (replace_parent).
		issues.add_sub_issue(
			found["installation_id"], found["full_name"], wanted, link.repository_provider_issue_id
		)
	elif not wanted and issue["parent_number"] and issue["parent_full_name"]:
		issues.remove_sub_issue(
			found["installation_id"],
			issue["parent_full_name"],
			issue["parent_number"],
			link.repository_provider_issue_id,
		)


def parent_issue_number(link: frappe._dict, task: Document) -> int | None:
	"""The Issue number the Task's parent maps to, or None for no parent or one that
	isn't published here: a standalone Issue. Raises while the parent's Issue is
	not created yet, so the key retries."""
	if not task.parent_task:
		return None
	parent = links.link_for_task(task.parent_task)
	if (
		not links.publishing(parent)
		or parent.project != link.project
		or parent.repository_id != link.repository_id
	):
		return None
	if not parent.issue_number:
		raise GitHubError(_("The parent task's GitHub Issue has not been created yet."))
	return parent.issue_number


PUSHERS: dict[str, Callable[[frappe._dict, Document, links.Target], None]] = {
	"title": push_title,
	"description": push_description,
	"status": push_status,
	"parent": push_parent,
}


def delete_issue(link: frappe._dict, found: links.Target) -> None:
	"""``issue: delete``: returns when the Issue is gone, and raises otherwise, which
	leaves the key in place and the link to_be_deleted. NOT_FOUND counts as gone only
	if the repository can still be read: otherwise it may only mean lost access."""
	if not link.issue_node_id:
		raise GitHubError(_("Envision does not have this Issue's GitHub node id, so it can't delete it."))
	try:
		issues.delete_issue(found["installation_id"], link.issue_node_id)
	except GitHubError as exc:
		if exc.status != 404:
			raise
		issues.check_repository(found["installation_id"], found["full_name"])


def finish_delete(link_name: str) -> None:
	"""Job mode only: the Issue is gone, so the link row and its Retry Job rows go, in
	one transaction. The cron's on-done hook does this for the cron's own row."""
	link = links.locked_link(link_name)
	if link:
		links.delete_link(link)
	frappe.db.commit()


def left_finished(link_name: str, copied: dict[str, str], done: set[str], modified: datetime) -> bool:
	"""Remove finished keys, under the row lock. Whether keys are left.

	``modified`` is the link's when ``copied`` was read. If a hook merged since, a
	finished key may hold a newer edit than the one pushed, so all of them stay.
	"""
	link = links.locked_link(link_name)
	if not link:
		return False
	current = delta.parse_delta(link.delta) or {}
	if link.modified != modified:
		return bool(current)
	left = delta.remove_done(current, copied, done)
	if left != current:
		frappe.db.set_value(
			store.ISSUE_SYNC, link_name, "delta", delta.dump_delta(left), update_modified=False
		)
	return bool(left)


def ensure_created(link: frappe._dict, task: Document, found: links.Target) -> None:
	"""Find or create the Task's Issue and record it, or raise a failure.

	Raising leaves ``issue: create`` where it is, for a later run.
	"""
	if link.repository_provider_issue_id:
		# The create's echo got here first, or an earlier run recorded it.
		finish_create(link.name, None, task, found)
		return
	if link.create_requested_at:
		started = get_datetime(link.create_requested_at)
		issue = find_created(found, task.name, started)
		if issue:
			finish_create(link.name, issue, task, found)
			return
		if now_datetime() - started < RESEND_AFTER:
			raise GitHubError(
				_("GitHub may have created this Issue. Envision is checking before trying again.")
			)
	send_create(link.name, task, found)


def send_create(link_name: str, task: Document, found: links.Target) -> None:
	"""Commit ``create_requested_at``, then POST the Issue. A failure that means it
	was definitely not created clears the time; an uncertain one keeps it."""
	require_marker(task.name)
	title = whole_title(task)
	body = description_body(task.name, task)
	ensure_label(found)
	frappe.db.set_value(
		store.ISSUE_SYNC, link_name, "create_requested_at", now_datetime(), update_modified=False
	)
	frappe.db.commit()
	try:
		issue = issues.create_issue(found["installation_id"], found["full_name"], title, body)
	except GitHubError as exc:
		if not exc.uncertain:
			frappe.db.set_value(
				store.ISSUE_SYNC, link_name, "create_requested_at", None, update_modified=False
			)
			frappe.db.commit()
		raise
	finish_create(link_name, issue, task, found)


def whole_title(task: Document) -> str:
	"""The Task's whole title, never shortened: one longer than GitHub allows fails.
	Only a note Envision marked continues it (setu.github.titles)."""
	title = titles.title(task.subject, task.description, False)
	if len(title) > MAX_TITLE_LENGTH:
		raise GitHubError(
			_(
				"This task's title, with its GitHub title continuation, is {0} characters; GitHub allows {1}. Shorten it to sync."
			).format(len(title), MAX_TITLE_LENGTH)
		)
	return title


def description_body(marker: str | None, task: Document) -> str:
	"""The Issue body for the Task's description, without the title's note. A
	conversion error fails like any other push: it shows and retries."""
	try:
		body = body_for(marker, titles.content(task.description, False))
	except Exception as exc:
		raise GitHubError(
			_("Envision could not convert this task's description for GitHub ({0}).").format(
				type(exc).__name__
			)
		) from exc
	if "body_too_long" in body["dropped"]:
		raise GitHubError(body_size_error())
	return body["body"]


def require_marker(task_name: str) -> None:
	"""A Task name the marker can't hold fails like any other push: it shows and retries."""
	try:
		convert.add_marker(None, task_name)
	except ValueError:
		raise GitHubError(
			_(
				"This task's name, {0}, can't mark its GitHub Issue: it must be 8 to 64 letters, numbers, hyphens or underscores."
			).format(task_name)
		) from None


def ensure_label(found: links.Target) -> None:
	"""Make sure the repository has the label the create sets, once per
	process. A label deleted on GitHub later is found again after a restart."""
	key = (frappe.local.site, found["full_name"].lower())
	if key in LABELLED:
		return
	issues.ensure_label(found["installation_id"], found["full_name"])
	LABELLED.add(key)


def app_login() -> str | None:
	"""The login GitHub shows as the author of Issues this site's app opens."""
	return client.app_login()


def created_by_app(issue: IssueData, login: str | None) -> bool:
	"""Whether this site's app opened the Issue. A marker alone is not enough:
	anyone can copy an Issue body, marker included."""
	return bool(login) and issue["author_type"] == "Bot" and issue["author_login"] == login


def find_created(found: links.Target, marker: str, started_at: datetime) -> IssueData | None:
	"""The Issue this site's app created with ``marker`` since the request."""
	login = app_login()
	if not login:
		# Its Issues cannot be told apart from anyone else's: never guess.
		raise GitHubError("The GitHub App's name is not known. Refresh GitHub settings.", uncertain=True)
	# Keep the same whole-second cutoff previously sent through clock.iso.
	since = (clock.to_utc(started_at) - timedelta(minutes=5)).replace(microsecond=0)
	try:
		match = scan_for_marker(found, marker, since, login, filtered=True)
		if match:
			return match
	except GitHubError as exc:
		if exc.status != 422:
			raise
	# A bot creator filter can be rejected or return an empty list. Check
	# all recent Issues before ruling a create out; every match still has
	# to be authored by this site's app bot.
	return scan_for_marker(found, marker, since, login, filtered=False)


def scan_for_marker(
	found: links.Target, marker: str, since: datetime, login: str, *, filtered: bool
) -> IssueData | None:
	for page in range(1, LOOKUP_PAGES + 1):
		result = issues.list_issues(
			found["installation_id"],
			found["full_name"],
			state="all",
			sort="created",
			direction="desc",
			since=since,
			creator=login if filtered else None,
			page=page,
		)
		for issue in result["issues"]:
			if (
				not issue["is_pull_request"]
				and created_by_app(issue, login)
				and convert.find_marker(issue["body"]) == marker
			):
				return issue
		if not result["more"]:
			return None
	# Too many recent Issues to be sure: stay uncertain rather than guess.
	raise GitHubError(
		"Too many recent Issues to check for this one. Envision will check again.", uncertain=True
	)


def finish_create(link_name: str, issue: IssueData | None, task: Document, found: links.Target) -> None:
	"""Record the Issue, clear ``create_requested_at`` and remove ``issue: create``, in
	one commit. ``issue`` is None when the link already holds its Issue.

	A row deleted while the request was out records nothing: its Task was deleted,
	and the Issue stays on GitHub (docs/adr/0008).
	"""
	link = links.locked_link(link_name)
	if not link:
		frappe.db.commit()
		return
	entries = delta.parse_delta(link.delta) or {}
	if entries.get(delta.ISSUE_RESOURCE) == delta.CREATE:
		del entries[delta.ISSUE_RESOURCE]
	values: dict[str, str | int | None] = {"create_requested_at": None, "delta": delta.dump_delta(entries)}
	recorded = bool(issue and link.repository_provider_issue_id in (None, "", issue["id"]))
	if recorded:
		values.update(
			{
				"repository_provider_issue_id": issue["id"],
				"issue_node_id": issue["node_id"],
				"issue_number": issue["number"],
				"issue_url": issue["html_url"],
			}
		)
	frappe.db.set_value(store.ISSUE_SYNC, link_name, values, update_modified=False)
	frappe.db.commit()
	if recorded:
		# After the link's commit: a comment writes the Task row, and a hook locks
		# the Task and then the link. It is never worth the identity GitHub just gave us.
		links.guarded(
			task.add_comment,
			"Info",
			_("Published to GitHub as {0}#{1}").format(found["full_name"], issue["number"]),
		)
		frappe.db.commit()


def body_size_error() -> str:
	return _("This task's description is too long for GitHub. Shorten it to sync the description.")


def site_url() -> str | None:
	try:
		return connection.public_url()
	except GitHubError:
		return None


def issue_marker(link: Document) -> str | None:
	"""The marker this link's Issue body carries: the Task's name, only for an
	Issue Envision created. None for an imported Issue or a deleted Task."""
	if link.origin == "Envision" and link.task:
		return link.task
	return None


def body_for(marker: str | None, html: str | None) -> IssueBody:
	"""The Issue body for a description. Envision's Issues carry their Task-name
	marker (``issue_marker``); an imported Issue's body gets none added."""
	url = site_url()
	if marker:
		return convert.issue_body(html, marker=marker, remote_body=None, site_url=url)
	result = convert.html_to_markdown(html, site_url=url)
	body = result["markdown"]
	dropped = list(result["dropped"])
	if len(body) > convert.MAX_BODY_LENGTH:
		dropped.append("body_too_long")
	return {
		"body": body,
		"changed": True,
		"lossy": result["lossy"] or "body_too_long" in dropped,
		"dropped": dropped,
	}
