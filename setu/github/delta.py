"""The closed vocabularies behind ``link.delta`` and Envision Retry Job (docs/adr/0008).

Pure checks with no Frappe import: the DocType controllers call these and raise
the translated messages. A check returns what is wrong, or a parsed value, so
this module also runs on its own.

``link.delta`` is always outbound (Envision → GitHub). A Retry Job's direction
comes from its ``job_key`` prefix.
"""

import json
import re
from collections.abc import Collection, Mapping
from typing import Literal, NamedTuple

Direction = Literal["inbound", "outbound"]
FieldResource = Literal["title", "description", "status", "parent"]
InboundAction = Literal["sync", "delete", "transferred"]
OutboundAction = Literal["create", "delete", "push"]
Action = InboundAction | OutboundAction


class Vocabulary(NamedTuple):
	"""The actions one direction allows on each kind of resource."""

	issue: frozenset[Action]
	field: frozenset[Action]
	comment: frozenset[Action]
	comment_id: re.Pattern[str]


ISSUE_RESOURCE = "issue"
COMMENT_PREFIX = "comment:"
# Inbound only: read every comment the Issue has now. Never inline: the cron runs it,
# so an Issue's whole history never has to fit in a webhook's 10 seconds.
COMMENTS_RESOURCE = "comments"
SYNC: InboundAction = "sync"
CREATE: OutboundAction = "create"
PUSH: OutboundAction = "push"
DELETE: Action = "delete"
TRANSFERRED: InboundAction = "transferred"
FIELD_RESOURCES: frozenset[FieldResource] = frozenset({"title", "description", "status", "parent"})

VOCABULARIES: dict[Direction, Vocabulary] = {
	# <id> is the GitHub comment id.
	"inbound": Vocabulary(
		issue=frozenset({"sync", "delete", "transferred"}),
		field=frozenset({"sync"}),
		comment=frozenset({"sync", "delete"}),
		comment_id=re.compile(r"[0-9]+"),
	),
	# <id> is the Envision Comment's name.
	"outbound": Vocabulary(
		issue=frozenset({"create", "delete"}),
		field=frozenset({"push"}),
		comment=frozenset({"push", "delete"}),
		comment_id=re.compile(r"\S+"),
	),
}

INBOUND_JOB_KEY = re.compile(r"github:issue:[0-9]+:[0-9]+")
OUTBOUND_JOB_KEY = re.compile(r"github:task:\S+")
INBOUND_KEY_PREFIX = "github:issue:"
OUTBOUND_KEY_PREFIX = "github:task:"


def inbound_job_key(repository_id: str, issue_id: str) -> str:
	"""The one GitHub → Envision row for an Issue."""
	return f"{INBOUND_KEY_PREFIX}{repository_id}:{issue_id}"


def outbound_job_key(task: str) -> str:
	"""The one Envision → GitHub row for a Task. The key keeps the Task's name
	after the Task is deleted, so find it by ``target.link``, not by this key."""
	return f"{OUTBOUND_KEY_PREFIX}{task}"


# Each direction's one handler. These same paths are the retry_job_handlers hook.
HANDLERS: dict[Direction, str] = {
	"inbound": "setu.github.inbound.apply_issue_delta",
	"outbound": "setu.github.outbound.push_task_delta",
}

INBOUND_TARGET_KEYS = frozenset({"repository_id", "issue_id", "issue_number"})
OUTBOUND_TARGET_KEYS = frozenset({"link"})
NUMERIC_ID = re.compile(r"[0-9]+")
DOCUMENT_NAME = re.compile(r"\S+")


def parse_object(value: object) -> dict[str, object] | None:
	"""A JSON field's value as a dict, or None when it is not a JSON object.

	A Document does not parse JSON fields, so the value is what was assigned or
	what the database driver returned: a dict, a JSON string or nothing. No value
	is an empty object.
	"""
	if value is None or value == "":
		return {}
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except json.JSONDecodeError:
			return None
	if not isinstance(value, dict):
		return None
	parsed = {key: item for key, item in value.items() if isinstance(key, str)}
	return parsed if len(parsed) == len(value) else None


def parse_delta(value: object) -> dict[str, str] | None:
	"""A delta field's ``{resource: action}``, or None when it is not that shape."""
	parsed = parse_object(value)
	if parsed is None:
		return None
	entries = {resource: action for resource, action in parsed.items() if isinstance(action, str)}
	return entries if len(entries) == len(parsed) else None


def dump_delta(entries: Mapping[str, str]) -> str | None:
	"""A delta as a JSON field stores it; nothing for an empty one, which is how
	``link.delta`` is cleared. A Document does not serialize JSON fields itself."""
	return json.dumps(entries, sort_keys=True) if entries else None


ISSUE_EVENT = "issues"
SUB_ISSUE_EVENT = "sub_issues"
COMMENT_EVENT = "issue_comment"
# What an issue_comment action does to that one comment. pinned/unpinned change nothing.
COMMENT_ACTIONS: dict[str, Action] = {"created": SYNC, "edited": SYNC, "deleted": DELETE}
SUB_ISSUE_ACTIONS = frozenset(
	{"sub_issue_added", "sub_issue_removed", "parent_issue_added", "parent_issue_removed"}
)
# What a state action changes on an Issue that has a link. With no link, it imports.
LINKED_UPDATES: dict[str, tuple[FieldResource, ...]] = {
	"closed": ("status",),
	"reopened": ("status",),
}
# An edit names only the fields GitHub includes in its webhook's changes object.
EDITED_FIELDS: dict[str, FieldResource] = {"title": "title", "body": "description"}


def comment_key(comment_id: str) -> str:
	return f"{COMMENT_PREFIX}{comment_id}"


def webhook_delta(
	event: str,
	action: str,
	*,
	linked: bool,
	comment_id: str | None = None,
	changed_fields: Collection[str] = (),
) -> dict[str, str]:
	"""Which resources an Issue event made stale, never their content (ADR "Webhook
	catalogue"). ``linked``: the Issue has a link.

	Empty means nothing to store: a quiet action (assigned, labeled, pinned and the
	like, or anything else not listed), and ``issues.deleted`` with no link, because
	an Issue is never imported in order to delete it. A sub_issues delta belongs on
	the child's row. An ``issue_comment`` names its comment (``comment_id``); one
	created or edited on an Issue with no link imports the Issue first, and a
	deleted one there has nothing to delete. A linked ``issues.edited`` syncs only
	the title/body fields named in ``changed_fields``, never an unchanged sibling.
	"""
	if event == COMMENT_EVENT:
		comment_action = COMMENT_ACTIONS.get(action)
		if not comment_action or not comment_id or not NUMERIC_ID.fullmatch(comment_id):
			return {}
		if linked:
			return {comment_key(comment_id): comment_action}
		return {ISSUE_RESOURCE: SYNC, comment_key(comment_id): SYNC} if comment_action == SYNC else {}
	if event == SUB_ISSUE_EVENT:
		return {"parent": SYNC} if action in SUB_ISSUE_ACTIONS else {}
	if event != ISSUE_EVENT:
		return {}
	if action == "opened":
		return {ISSUE_RESOURCE: SYNC}
	if action == "deleted":
		return {ISSUE_RESOURCE: DELETE} if linked else {}
	if action == "transferred":
		return {ISSUE_RESOURCE: TRANSFERRED}
	if action == "edited":
		if not linked:
			return {ISSUE_RESOURCE: SYNC}
		return {resource: SYNC for field, resource in EDITED_FIELDS.items() if field in changed_fields}
	if action not in LINKED_UPDATES:
		return {}
	return dict.fromkeys(LINKED_UPDATES[action], SYNC) if linked else {ISSUE_RESOURCE: SYNC}


def merge_delta(current: Mapping[str, str], incoming: Mapping[str, str]) -> dict[str, str]:
	"""Merge new work into a delta, in either direction (ADR "Delta merge rules").

	``issue: delete`` replaces every key and stays: deletion wins over everything.
	``issue: transferred`` replaces every key too, unless the Issue is being
	deleted. Any other key is added, and a key that holds ``delete`` keeps it: a
	deleted comment does not come back.
	"""
	issue_actions = {current.get(ISSUE_RESOURCE), incoming.get(ISSUE_RESOURCE)}
	if DELETE in issue_actions:
		return {ISSUE_RESOURCE: DELETE}
	if TRANSFERRED in issue_actions:
		return {ISSUE_RESOURCE: TRANSFERRED}
	merged = dict(current)
	for resource, action in incoming.items():
		merged[resource] = DELETE if merged.get(resource) == DELETE else action
	return merged


def remove_done(
	current: Mapping[str, str], copied: Mapping[str, str], done: Collection[str]
) -> dict[str, str]:
	"""The delta after a run: finished keys go if they still hold the copied value."""
	return {
		resource: action
		for resource, action in current.items()
		if resource not in done or copied.get(resource) != action
	}


def allowed_actions(resource: str, direction: Direction) -> frozenset[Action]:
	"""The actions a resource allows in this direction; none for an unknown resource."""
	vocabulary = VOCABULARIES[direction]
	if resource == COMMENTS_RESOURCE:
		return frozenset({SYNC}) if direction == "inbound" else frozenset()
	if resource == ISSUE_RESOURCE:
		return vocabulary.issue
	if resource in FIELD_RESOURCES:
		return vocabulary.field
	if resource.startswith(COMMENT_PREFIX) and vocabulary.comment_id.fullmatch(
		resource.removeprefix(COMMENT_PREFIX)
	):
		return vocabulary.comment
	return frozenset()


def unknown_entries(entries: Mapping[str, str], direction: Direction) -> list[str]:
	"""Each ``resource: action`` outside this direction's vocabulary."""
	return [
		f"{resource}: {action}"
		for resource, action in entries.items()
		if action not in allowed_actions(resource, direction)
	]


def job_direction(job_key: str | None) -> Direction | None:
	"""The direction a job key names, or None when it has neither shape."""
	key = job_key or ""
	if INBOUND_JOB_KEY.fullmatch(key):
		return "inbound"
	if OUTBOUND_JOB_KEY.fullmatch(key):
		return "outbound"
	return None


def is_numeric_id(value: object) -> bool:
	return isinstance(value, str) and NUMERIC_ID.fullmatch(value) is not None


def is_document_name(value: object) -> bool:
	return isinstance(value, str) and DOCUMENT_NAME.fullmatch(value) is not None


def is_issue_number(value: object) -> bool:
	# bool is an int in Python, and JSON true is not an Issue number.
	return isinstance(value, int) and not isinstance(value, bool) and value > 0


def is_valid_target(target: Mapping[str, object], direction: Direction) -> bool:
	"""IDs only, with exactly the keys this direction's handler reads."""
	if direction == "outbound":
		return set(target) == OUTBOUND_TARGET_KEYS and is_document_name(target["link"])
	return (
		set(target) == INBOUND_TARGET_KEYS
		and is_numeric_id(target["repository_id"])
		and is_numeric_id(target["issue_id"])
		and is_issue_number(target["issue_number"])
	)
