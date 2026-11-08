"""A link's sync_state and the rules that move it (docs/adr/0008).

Pure rules with no Frappe import, like ``delta``: callers read the facts, ask
here what to do, and write the answer. Each link has one sync_state shared by
both directions; Envision → GitHub and GitHub → Envision only differ in where a
change starts.

Two states are marks set by an event and kept until the row goes:
``to_be_deleted`` (deletion wins) and ``unlinked`` (deliberately no longer
synced). The other four are derived from the link's facts, never set by hand:

- ``cron_sync``: a Retry Job row exists for the link, in either direction.
- ``not_synced``: no Retry Job row and no Issue yet.
- ``to_be_updated``: no Retry Job row and ``link.delta`` is not empty.
- ``synced``: no Retry Job row and ``link.delta`` is empty.
"""

from collections.abc import Mapping
from enum import StrEnum
from typing import Literal, NamedTuple

LinkState = Literal["not_synced", "synced", "to_be_updated", "cron_sync", "to_be_deleted", "unlinked"]

NOT_SYNCED: LinkState = "not_synced"
SYNCED: LinkState = "synced"
TO_BE_UPDATED: LinkState = "to_be_updated"
CRON_SYNC: LinkState = "cron_sync"
TO_BE_DELETED: LinkState = "to_be_deleted"
UNLINKED: LinkState = "unlinked"

MARKS: frozenset[LinkState] = frozenset({TO_BE_DELETED, UNLINKED})

# None is "no row": before a link is inserted, or after its row is deleted.
# Staying in the same state is always allowed and not listed.
TRANSITIONS: dict[LinkState | None, frozenset[LinkState | None]] = {
	# Task published (not_synced), or Issue imported / re-linked by marker (synced).
	None: frozenset({NOT_SYNCED, SYNCED}),
	# Create succeeded, create succeeded with keys merged during the run, create
	# failed, Task moved or converted, Task deleted with no Issue id, or with one
	# the create has just recorded and the job has not settled yet.
	NOT_SYNCED: frozenset({SYNCED, TO_BE_UPDATED, CRON_SYNC, TO_BE_DELETED, UNLINKED, None}),
	# Edit saved, apply failed, Task deleted or delete refused, moved or converted,
	# issues.deleted applied inline or issues.transferred.
	SYNCED: frozenset({TO_BE_UPDATED, CRON_SYNC, TO_BE_DELETED, UNLINKED, None}),
	# Push succeeded, push or apply failed, then the same as synced.
	TO_BE_UPDATED: frozenset({SYNCED, CRON_SYNC, TO_BE_DELETED, UNLINKED, None}),
	# The row goes with nothing pending (synced) or with outbound keys left in
	# link.delta (to_be_updated), Task deleted or delete refused, moved or
	# converted, Task deleted after a failed create, issues.transferred.
	CRON_SYNC: frozenset({SYNCED, TO_BE_UPDATED, TO_BE_DELETED, UNLINKED, None}),
	# Only finishing the delete leaves: issues.deleted, or the delete job or cron succeeded.
	TO_BE_DELETED: frozenset({None}),
	# Only the Project's deletion removes the row.
	UNLINKED: frozenset({None}),
}


def can_transition(current: LinkState | None, new: LinkState | None) -> bool:
	"""Whether a link may move from ``current`` to ``new`` (None: no row)."""
	return current == new or new in TRANSITIONS.get(current, frozenset())


class Facts(NamedTuple):
	"""What a derived state is read from."""

	has_issue: bool
	"""The link holds an Issue identity (it was created on, or imported from, GitHub)."""
	link_delta: Mapping[str, str]
	"""link.delta: outbound keys not yet pushed and not handed to a Retry Job."""
	has_retry_job: bool
	"""A Retry Job row exists for the link in either direction."""


def derived_state(facts: Facts) -> LinkState:
	"""The state the facts give a link that carries no mark."""
	if facts.has_retry_job:
		return CRON_SYNC
	if not facts.has_issue:
		return NOT_SYNCED
	if facts.link_delta:
		return TO_BE_UPDATED
	return SYNCED


def settled_state(current: LinkState, facts: Facts) -> LinkState:
	"""The state after the facts change: a mark is kept, anything else is re-derived.

	Every write that changes link.delta or a Retry Job row ends with this,
	including the Retry Job on-done hook, so ``synced`` always means nothing is
	pending in either direction.
	"""
	return current if current in MARKS else derived_state(facts)


# Events.


def accepts_envision_edit(state: LinkState) -> bool:
	"""Whether a Task hook records keys for this link. A deleted or unlinked link ignores edits."""
	return state not in MARKS


def accepts_import(state: LinkState | None) -> bool:
	"""Whether an import (activation or a webhook) may merge into this link.

	No row: the import makes one. A mark makes the import skip it.
	"""
	return state not in MARKS


def accepts_webhook(state: LinkState, *, issue_deleted: bool) -> bool:
	"""Whether a linked Issue's webhook is stored or applied.

	An unlinked link ignores everything (200, nothing stored). A to_be_deleted
	link ignores everything but issues.deleted, which finishes it. A deleted
	comment is not that: it is ignored like any other event.
	"""
	if state == UNLINKED:
		return False
	if state == TO_BE_DELETED:
		return issue_deleted
	return True


class Outcome(StrEnum):
	"""What the caller does to the link row."""

	IGNORE = "ignore"
	"""Nothing: no write, no GitHub call."""
	DELETE_ROW = "delete_row"
	"""Delete the link row and its Retry Job rows."""
	CLEAR_TASK = "clear_task"
	"""Keep the row and its state; clear task."""
	MARK_TO_BE_DELETED = "mark_to_be_deleted"
	"""to_be_deleted; delta becomes {"issue": "delete"} in link.delta or the outbound Retry Job."""
	MARK_UNLINKED = "mark_unlinked"
	"""unlinked; link.delta cleared, Retry Job rows deleted, github tag removed."""
	QUEUE_FOR_CRON = "queue_for_cron"
	"""Merge the event into the link's inbound Retry Job delta; the cron applies it."""


def on_task_deleted(state: LinkState, *, has_issue: bool) -> Outcome:
	"""Envision → GitHub 3a/3b. Sync off changes nothing: a to_be_deleted link waits.

	A link that still holds a Task and carries a mark keeps it: unlinked, or
	to_be_deleted after GitHub's delete of that Task was refused. A link with no
	Issue (not_synced, or cron_sync after a failed create) is just deleted.
	"""
	if state in MARKS:
		return Outcome.CLEAR_TASK
	if not has_issue:
		return Outcome.DELETE_ROW
	return Outcome.MARK_TO_BE_DELETED


def on_issue_transferred(state: LinkState, *, has_inbound_job: bool) -> Outcome:
	"""GitHub → Envision 5: from any live state the link row goes, never as deletion.

	Deletion wins over a transfer, and an unlinked link ignores it. With a
	github:issue Retry Job row the event merges into it (``issue: transferred``
	replaces the delta unless a delete is present) and the cron finishes it, so
	events for one Issue apply in order. Otherwise it applies now: the link row
	and every Retry Job row go, outbound included, so no push reaches the moved
	Issue.
	"""
	if state in MARKS:
		return Outcome.IGNORE
	if has_inbound_job:
		return Outcome.QUEUE_FOR_CRON
	return Outcome.DELETE_ROW


def on_task_moved(state: LinkState) -> Outcome:
	"""Envision → GitHub 5: Task moved to another Project, or made a milestone or template.

	unlinked can be entered from any state except to_be_deleted. Cancelled does
	not unlink: the Issue closes as not_planned and they stay linked.
	"""
	if state == TO_BE_DELETED or state == UNLINKED:
		return Outcome.IGNORE
	return Outcome.MARK_UNLINKED


def on_inbound_failed(state: LinkState) -> Outcome:
	"""An inbound apply failed, or the lock was busy or the site binding unconfirmed.

	The event goes to the Retry Job row, so the link settles as cron_sync.
	"""
	if state in MARKS:
		return Outcome.IGNORE
	return Outcome.QUEUE_FOR_CRON


def on_inbound_delete_refused(state: LinkState) -> LinkState:
	"""The Task tree's deletion was refused and rolled back: retry it from to_be_deleted."""
	return TO_BE_DELETED if state != UNLINKED else UNLINKED


def project_delete_blocked(states: Mapping[LinkState, int], *, sync_enabled: bool) -> bool:
	"""A Project with to_be_deleted links can't be deleted while sync is on.

	With sync off it can: those rows go and their Issues stay.
	"""
	return sync_enabled and states.get(TO_BE_DELETED, 0) > 0


def kept_on_sync_off(retry_job_delta: Mapping[str, str], *, inbound: bool) -> bool:
	"""Turning sync off deletes github:issue Retry Job rows, except those holding issue: delete.

	Outbound (github:task) rows, link rows and link.delta are kept.
	"""
	return not inbound or retry_job_delta.get("issue") == "delete"
