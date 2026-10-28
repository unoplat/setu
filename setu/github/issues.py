"""GitHub Issue and sub-issue REST calls for one installation's repository.

Reads and writes use githubkit's typed REST methods, so sync code never reads
raw JSON. A create whose reply cannot be read is uncertain: the next attempt
looks it up by its marker instead of creating it again. Issues endpoints also
return pull requests; ``IssueData`` marks them and callers skip them.

Endpoints (API version 2022-11-28):

- ``GET/PATCH /repos/{owner}/{repo}/issues/{number}``, ``POST /repos/{owner}/{repo}/issues``
- ``GET /repos/{owner}/{repo}/issues`` (``state``, ``since``, ``sort``,
  ``direction``, ``labels``, ``creator``, ``per_page``, ``page``)
- ``GET /repos/{owner}/{repo}/labels/{name}``, ``POST /repos/{owner}/{repo}/labels``
  and ``POST /repos/{owner}/{repo}/issues/{number}/labels`` (which adds to the
  Issue's labels): the label every Issue published from Envision carries.
- ``GET/POST /repos/{owner}/{repo}/issues/{number}/sub_issues`` and
  ``DELETE /repos/{owner}/{repo}/issues/{number}/sub_issue``: the body names
  the child by its Issue **id**, not its number.
- ``GET /app`` (app JWT): the events the app is subscribed to.
"""

import re
from datetime import datetime
from typing import Literal, TypedDict

from githubkit.compat import type_validate_json
from githubkit.utils import UNSET
from githubkit_schemas.v2022_11_28.models import Issue
from githubkit_schemas.v2022_11_28.types import ReposOwnerRepoIssuesIssueNumberPatchBodyType
from pydantic import ValidationError

from setu.github import client, clock
from setu.github.client import GitHubError

FULL_NAME = re.compile(r"[A-Za-z0-9-]+/[A-Za-z0-9._-]+")
# ``parent_issue_url``: https://api.github.com/repos/{owner}/{repo}/issues/{number}
PARENT_URL = re.compile(r"/repos/([A-Za-z0-9-]+/[A-Za-z0-9._-]+)/issues/(\d+)$")
PAGE_SIZE = 100
# GitHub nests sub-issues at most eight levels deep.
MAX_DEPTH = 8
# Marks the Issues Envision publishes; never synced, so removing it on GitHub
# changes nothing.
ENVISION_LABEL = "envision-erpnext"
ENVISION_LABEL_COLOR = "d4c5f9"
ENVISION_LABEL_DESCRIPTION = "Published from Envision (ERPNext)"

IssueState = Literal["open", "closed"]


class IssueData(TypedDict):
	id: str
	node_id: str
	number: int
	title: str
	body: str
	state: IssueState
	# completed, not_planned, duplicate, reopened, or None.
	state_reason: str | None
	html_url: str
	created_at: str
	updated_at: str
	closed_at: str | None
	is_pull_request: bool
	author_login: str
	author_type: str
	# From ``sub_issues_summary``; None when GitHub did not send it.
	sub_issue_count: int | None
	# From ``parent_issue_url``: the parent's repository and number, or None
	# when the Issue has no parent (or GitHub did not send it).
	parent_full_name: str | None
	parent_number: int | None


class IssuePage(TypedDict):
	issues: list[IssueData]
	# Whether another page may follow (this one was full).
	more: bool


def repository_parts(full_name: str) -> tuple[str, str]:
	if not FULL_NAME.fullmatch(full_name or ""):
		raise GitHubError("The repository name is not valid. Refresh GitHub settings.")
	owner, repo = full_name.split("/", 1)
	return owner, repo


def get_issue(installation_id: str, full_name: str, number: int) -> IssueData:
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	return issue_data(
		client.installation_call(
			installation_id, github.rest(client.API_VERSION).issues.get, owner, repo, number
		)
	)


def create_issue(installation_id: str, full_name: str, title: str, body: str) -> IssueData:
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	response = client.installation_write(
		installation_id,
		github.rest(client.API_VERSION).issues.create,
		owner,
		repo,
		data={"title": title, "body": body, "labels": [ENVISION_LABEL]},
	)
	try:
		return issue_data(response.parsed_data)
	except ValidationError, GitHubError:
		raise GitHubError("GitHub returned an invalid Issue.", uncertain=True) from None


def update_issue(
	installation_id: str, full_name: str, number: int, patch: ReposOwnerRepoIssuesIssueNumberPatchBodyType
) -> IssueData:
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	response = client.installation_write(
		installation_id, github.rest(client.API_VERSION).issues.update, owner, repo, number, data=patch
	)
	# The reply is the Issue plus ``suggestions``, which sync never reads. Read it
	# as an Issue so a suggestion value the schema does not know cannot fail it.
	try:
		return issue_data(type_validate_json(Issue, response.content))
	except ValidationError:
		raise GitHubError("GitHub returned an invalid Issue.") from None


def list_issues(
	installation_id: str,
	full_name: str,
	*,
	state: Literal["open", "closed", "all"],
	sort: Literal["created", "updated", "comments"],
	direction: Literal["asc", "desc"],
	page: int,
	labels: str | None = None,
	creator: str | None = None,
	since: datetime | None = None,
) -> IssuePage:
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	result = client.installation_call(
		installation_id,
		github.rest(client.API_VERSION).issues.list_for_repo,
		owner,
		repo,
		state=state,
		sort=sort,
		direction=direction,
		labels=labels if labels is not None else UNSET,
		creator=creator if creator is not None else UNSET,
		since=since if since is not None else UNSET,
		per_page=PAGE_SIZE,
		page=page,
	)
	return {"issues": [issue_data(item) for item in result], "more": len(result) >= PAGE_SIZE}


def ensure_label(installation_id: str, full_name: str) -> None:
	"""Create the Envision label in the repository unless it is there. GitHub
	does not document what an Issue create does with a missing label."""
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	try:
		client.installation_call(
			installation_id, github.rest(client.API_VERSION).issues.get_label, owner, repo, ENVISION_LABEL
		)
		return
	except GitHubError as exc:
		if exc.status != 404:
			raise
	try:
		client.installation_write(
			installation_id,
			github.rest(client.API_VERSION).issues.create_label,
			owner,
			repo,
			data={
				"name": ENVISION_LABEL,
				"color": ENVISION_LABEL_COLOR,
				"description": ENVISION_LABEL_DESCRIPTION,
			},
		)
	except GitHubError as exc:
		# Created meanwhile by another worker.
		if exc.status != 422:
			raise


def add_label(installation_id: str, full_name: str, number: int) -> None:
	"""Add the Envision label to an Issue, keeping its other labels."""
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	client.installation_write(
		installation_id,
		github.rest(client.API_VERSION).issues.add_labels,
		owner,
		repo,
		number,
		data={"labels": [ENVISION_LABEL]},
	)


def list_sub_issues(installation_id: str, full_name: str, number: int) -> list[IssueData]:
	"""Every sub-issue of an Issue, open and closed, all pages."""
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	found: list[IssueData] = []
	page = 1
	while True:
		result = client.installation_call(
			installation_id,
			github.rest(client.API_VERSION).issues.list_sub_issues,
			owner,
			repo,
			number,
			per_page=PAGE_SIZE,
			page=page,
		)
		found.extend(issue_data(item) for item in result)
		if len(result) < PAGE_SIZE or page >= 50:
			return found
		page += 1


def add_sub_issue(installation_id: str, full_name: str, parent_number: int, child_id: str) -> None:
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	# replace_parent moves a child that already has another parent.
	client.installation_write(
		installation_id,
		github.rest(client.API_VERSION).issues.add_sub_issue,
		owner,
		repo,
		parent_number,
		data={"sub_issue_id": int(child_id), "replace_parent": True},
	)


def remove_sub_issue(installation_id: str, full_name: str, parent_number: int, child_id: str) -> None:
	owner, repo = repository_parts(full_name)
	github = client.installation_client(installation_id)
	client.installation_write(
		installation_id,
		github.rest(client.API_VERSION).issues.remove_sub_issue,
		owner,
		repo,
		parent_number,
		data={"sub_issue_id": int(child_id)},
	)


def subscribed_events() -> list[str]:
	github = client.app_client()
	app = client.app_call(github.rest(client.API_VERSION).apps.get_authenticated)
	if app is None:
		raise GitHubError("GitHub returned an invalid app description.")
	return sorted(app.events)


def issue_data(issue: Issue) -> IssueData:
	if issue.state not in ("open", "closed"):
		raise GitHubError("GitHub returned an invalid Issue.")
	parent = PARENT_URL.search(issue.parent_issue_url) if isinstance(issue.parent_issue_url, str) else None
	return {
		"id": str(issue.id),
		"node_id": issue.node_id,
		"number": issue.number,
		"title": issue.title,
		"body": "" if issue.body is UNSET or issue.body is None else issue.body,
		"state": "open" if issue.state == "open" else "closed",
		"state_reason": None if issue.state_reason is UNSET else issue.state_reason or None,
		"html_url": issue.html_url,
		"created_at": clock.iso(issue.created_at),
		"updated_at": clock.iso(issue.updated_at),
		"closed_at": clock.iso(issue.closed_at) if issue.closed_at is not None else None,
		"is_pull_request": issue.pull_request is not UNSET,
		"author_login": issue.user.login if issue.user is not None else "",
		"author_type": issue.user.type if issue.user is not None else "",
		"sub_issue_count": (
			issue.sub_issues_summary.total
			if issue.sub_issues_summary is not UNSET and issue.sub_issues_summary is not None
			else None
		),
		"parent_full_name": parent.group(1) if parent else None,
		"parent_number": int(parent.group(2)) if parent else None,
	}
