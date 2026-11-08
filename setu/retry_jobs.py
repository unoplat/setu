"""The Envision Retry Job cron, and its contract with handlers (docs/adr/0008).

Generic: nothing here knows about any integration. A handler named in the
``retry_job_handlers`` hook has the signature

    handler(target: dict[str, str | int], entries: dict[str, str] | None = None) -> HandlerResult

An integration registers three more hooks by the row's ``integration``, each called
with the row. Their function names come from code, never from a row:

- ``retry_job_gate``: true when the row must wait. It keeps its attempts and doesn't run.
- ``retry_job_lock``: runs before the cron locks the row after a handler, and takes
  whatever must be locked before it. Writers lock their own records and then the row,
  so an on-done hook that had to lock them after the row could deadlock with them.
- ``retry_job_on_done``: runs in the transaction that deletes an emptied row.

All delta values repeat, so a value can't show a merge during a run. Every merge sets
``next_retry_at``, so the cron compares that with the value it picked.

Timing. Frappe runs ``scheduler_events`` crons in the default queue, whose jobs die at
300 seconds, and it has no long cron. So the schedule only enqueues ``run_cron`` in the
long queue, with one job id, which deduplicates while a run is queued or started.
Rows start only in the first ``RUN_BUDGET_SECONDS``; a row started last can still use
``ROW_LIMIT_SECONDS`` before the job's timeout, and the rest go back to Pending unrun.
A lease outlasts the job's life, which RQ ends by killing it 60 seconds past its
timeout, so it only expires on a row whose run has died.
"""

import json
import random
import time
import traceback
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import NamedTuple

import frappe
from frappe.utils import add_to_date, now_datetime

RETRY_JOB = "Envision Retry Job"
PENDING = "Pending"
RUNNING = "Running"
CRON_METHOD = "setu.retry_jobs.run_cron"
CRON_JOB_ID = "envision-retry-cron"
CRON_QUEUE = "long"
FAILURE_TITLE = "Retry Job failed"

RUN_BUDGET_SECONDS = 1500
# The longest one row may run. setu.github.store's Issue lock lasts this long too.
ROW_LIMIT_SECONDS = 1800
JOB_TIMEOUT_SECONDS = RUN_BUDGET_SECONDS + ROW_LIMIT_SECONDS
STALE_LEASE_SECONDS = 3600

BATCH = 50
# How many batches one run may read while gated rows are all it finds.
PICK_PASSES = 10
# One cron interval. Each of these rows only asks to be looked at again.
RECHECK_SECONDS = 300
BACKOFF_BASE_SECONDS = 60
BACKOFF_MAX_SECONDS = 3600
BACKOFF_JITTER = 0.1
# 2^6 times the base is already past the maximum.
BACKOFF_MAX_EXPONENT = 6
LEASE_FIELDS = ["name", "job_key", "handler", "target", "delta", "integration", "next_retry_at"]


class HandlerResult(NamedTuple):
	"""What a handler finished."""

	done: frozenset[str]
	"""Delta keys finished."""
	error: str | None = None
	"""Error Log name for the latest failure."""
	rate_limited: bool = False
	"""Do not count an attempt."""


Handler = Callable[[dict[str, str | int], dict[str, str] | None], HandlerResult]


class RefusedRow(Exception):
	"""A row the cron won't run: it stays, and backs off like any failure."""


def enqueue_cron() -> None:
	"""scheduler_events. The run itself needs the long queue: see the module docstring."""
	frappe.enqueue(
		CRON_METHOD,
		queue=CRON_QUEUE,
		timeout=JOB_TIMEOUT_SECONDS,
		job_id=CRON_JOB_ID,
		deduplicate=True,
	)


def run_cron() -> None:
	"""One pass: stale leases, pick, then each row. One row's failure touches no other."""
	started = time.monotonic()
	release_stale_leases()
	leases = pick_due()
	for index, lease in enumerate(leases):
		if time.monotonic() - started >= RUN_BUDGET_SECONDS:
			release_leases(leases[index:])
			return
		run_row(lease)


def release_stale_leases() -> None:
	"""Rows whose run died. A row that is still running can't be this old."""
	frappe.db.set_value(
		RETRY_JOB,
		{
			"status": RUNNING,
			"started_at": ["<", add_to_date(now_datetime(), seconds=-STALE_LEASE_SECONDS)],
		},
		{"status": PENDING, "started_at": None},
		update_modified=False,
	)
	# Release stale-row SQL locks before the picker acquires a batch in due-time order.
	frappe.db.commit()  # nosemgrep: frappe-manual-commit


def release_leases(leases: list[frappe._dict]) -> None:
	"""Leases this run has no time left for. They ran nothing, so nothing else changes,
	and they are the oldest rows the next run sees."""
	frappe.db.set_value(
		RETRY_JOB,
		{"name": ["in", [lease.name for lease in leases]], "status": RUNNING},
		{"status": PENDING, "started_at": None},
		update_modified=False,
	)
	# run_cron now returns; Frappe commits these unused leases with the job.


def pick_due() -> list[frappe._dict]:
	"""Lease up to ``BATCH`` due rows, each pass in its own transaction.

	Only an integration knows what is gated, so SQL can't leave those rows out. Each one
	seen moves to the next interval instead, behind anything else that is due, and the
	next pass reads on. So gated rows can only delay others, and only when a run can't
	read them all: then by as many runs as it takes to read them.
	"""
	leases: list[frappe._dict] = []
	for _pass in range(PICK_PASSES):
		limit = BATCH - len(leases)
		rows = select_due(limit)
		leases.extend(lease_rows(rows))
		# Publish lease claims and release SKIP LOCKED row locks before running handlers.
		frappe.db.commit()  # nosemgrep: frappe-manual-commit
		if len(rows) < limit or len(leases) == BATCH:
			break
	return leases


def select_due(limit: int) -> list[frappe._dict]:
	job = frappe.qb.DocType(RETRY_JOB)
	return (
		frappe.qb.from_(job)
		.select(*(job[field] for field in LEASE_FIELDS))
		.where(job.status == PENDING)
		.where(job.next_retry_at <= now_datetime())
		.orderby(job.next_retry_at)
		.limit(limit)
		.for_update(skip_locked=True)
	).run(as_dict=True)


def lease_rows(rows: list[frappe._dict]) -> list[frappe._dict]:
	"""Running with a start time, or moved on if gated. The handler's work is the delta
	read here, under the row's lock."""
	now = now_datetime()
	leased: list[frappe._dict] = []
	for row in rows:
		if is_gated(row):
			frappe.db.set_value(
				RETRY_JOB,
				row.name,
				"next_retry_at",
				now + timedelta(seconds=RECHECK_SECONDS),
				update_modified=False,
			)
		else:
			frappe.db.set_value(
				RETRY_JOB, row.name, {"status": RUNNING, "started_at": now}, update_modified=False
			)
			leased.append(row)
	return leased


def is_gated(row: frappe._dict) -> bool:
	"""A gate that fails counts as gated: nothing runs that it might have stopped."""
	try:
		return any(frappe.get_attr(path)(row) for path in hook_paths("retry_job_gate", row))
	except Exception as exc:
		log_failure(exc, row.name)
		return True


def hook_paths(hook: str, row: frappe._dict) -> list[str]:
	return frappe.get_hooks(hook, {}).get(row.integration, [])


def run_row(lease: frappe._dict) -> None:
	"""A failure finishing the row, such as a deadlock, undoes only that: the row stays
	Running, and its lease running out brings it back."""
	result = call_handler(lease)
	try:
		finish_row(lease, result)
	except Exception as exc:
		roll_back()
		log_failure(exc, lease.name)


def call_handler(lease: frappe._dict) -> HandlerResult:
	"""Never raises. A refused row and a raising handler end the same way: nothing finished."""
	try:
		handler = allowed_handler(lease.handler)
		return handler(row_target(lease.target), row_entries(lease.delta))
	except Exception as exc:
		roll_back()
		return HandlerResult(frozenset(), error=log_failure(exc, lease.name))


def allowed_handler(path: str) -> Handler:
	"""Checked before the name is resolved, so editing a row can't run arbitrary code."""
	if path not in frappe.get_hooks("retry_job_handlers"):
		raise RefusedRow(f"Handler {path} is not in the retry_job_handlers hook.")
	return frappe.get_attr(path)


def json_object(value: str | dict[str, object] | None) -> dict[str, object]:
	"""A JSON field as the database returns it. Nothing is an empty object."""
	if not value:
		return {}
	try:
		parsed = json.loads(value) if isinstance(value, str) else value
	except json.JSONDecodeError:
		raise RefusedRow("This row's JSON is not valid.") from None
	if not isinstance(parsed, dict):
		raise RefusedRow("This row's JSON is not an object.")
	return parsed


def row_target(value: str | dict[str, object] | None) -> dict[str, str | int]:
	target: dict[str, str | int] = {}
	for key, item in json_object(value).items():
		if not isinstance(item, str | int):
			raise RefusedRow("This row's target holds something other than IDs.")
		target[key] = item
	return target


def row_entries(value: str | dict[str, object] | None) -> dict[str, str]:
	entries: dict[str, str] = {}
	for key, item in json_object(value).items():
		if not isinstance(item, str):
			raise RefusedRow("This row's delta holds something other than actions.")
		entries[key] = item
	return entries


def finish_row(lease: frappe._dict, result: HandlerResult) -> None:
	"""Lock the row again and settle it, in one transaction. A row deleted during the run
	ends quietly and is not written back.

	Read without a lock first: locking a missing key takes a gap lock. The commit gives
	that read a current snapshot, and the handler has committed its own work."""
	# Start settlement with a fresh snapshot, separate from the handler's transaction.
	frappe.db.commit()  # nosemgrep: frappe-manual-commit
	if not frappe.db.exists(RETRY_JOB, lease.name):
		return
	for path in hook_paths("retry_job_lock", lease):
		frappe.get_attr(path)(lease)
	row = frappe.db.get_value(
		RETRY_JOB, lease.name, ["delta", "attempts", "next_retry_at"], as_dict=True, for_update=True
	)
	if row:
		settle_row(lease, row, result)
	# Each lease finishes independently; a later row's failure must not undo this one.
	frappe.db.commit()  # nosemgrep: frappe-manual-commit


def settle_row(lease: frappe._dict, row: frappe._dict, result: HandlerResult) -> None:
	"""A merge during the run keeps every key: a finished one may hold a newer change than
	the one applied. A handler merging into its own row (an import that found a parent)
	reruns its keys, which are idempotent, and finds nothing to merge the second time."""
	merged = row.next_retry_at != lease.next_retry_at
	current = row_entries(row.delta)
	left = current if merged else keys_left(current, row_entries(lease.delta), result.done)
	if left:
		requeue_row(lease.name, row, left, result, merged)
		return
	frappe.db.delete(RETRY_JOB, {"name": lease.name})
	for path in hook_paths("retry_job_on_done", lease):
		frappe.get_attr(path)(lease)


def keys_left(current: dict[str, str], copied: dict[str, str], done: frozenset[str]) -> dict[str, str]:
	return {
		resource: action
		for resource, action in current.items()
		if resource not in done or copied.get(resource) != action
	}


def requeue_row(
	name: str, row: frappe._dict, left: dict[str, str], result: HandlerResult, merged: bool
) -> None:
	attempts = row.attempts or 0
	values: dict[str, str | int | datetime | None] = {
		"status": PENDING,
		"started_at": None,
		"delta": json.dumps(left, sort_keys=True),
		"attempts": attempts if result.rate_limited else attempts + 1,
		"next_retry_at": next_retry_at(attempts, result, merged),
	}
	if result.error:
		values["error_log"] = result.error
	frappe.db.set_value(RETRY_JOB, name, values, update_modified=False)


def next_retry_at(attempts: int, result: HandlerResult, merged: bool) -> datetime:
	"""Now after a merge, so a new change waits one interval at most. A rate-limited row
	looks again next interval: the handler holds the integration's own wait, and stops
	at it without sending anything or using an attempt until that wait is over."""
	now = now_datetime()
	if merged:
		return now
	if result.rate_limited:
		return now + timedelta(seconds=RECHECK_SECONDS)
	return now + timedelta(seconds=backoff_seconds(attempts))


def backoff_seconds(attempts: int) -> float:
	"""``min(base * 2^attempts, 1 hour) + jitter``, from the attempts before this one."""
	delay = min(BACKOFF_BASE_SECONDS * 2 ** min(attempts, BACKOFF_MAX_EXPONENT), BACKOFF_MAX_SECONDS)
	return delay + random.uniform(0, delay * BACKOFF_JITTER)


def roll_back() -> None:
	"""A rollback that hits a dead database must not end the run. The next row's work
	fails on its own, and the leases bring them all back."""
	try:
		frappe.db.rollback()
	except Exception:
		frappe.logger("envision.retry_jobs").error("Could not roll back a Retry Job's transaction.")


def log_failure(exc: BaseException, name: str) -> str | None:
	"""Write and commit an Error Log, and return its name, or None if it could not be
	written. Frappe's default traceback holds local variables, which may hold record
	content or tokens: this keeps source locations and the type, and a refusal's reason."""
	frames = traceback.extract_tb(exc.__traceback__)
	diagnostic = "\n".join(f"{frame.filename}:{frame.lineno} in {frame.name}" for frame in frames)
	diagnostic += f"\n{type(exc).__name__}"
	if isinstance(exc, RefusedRow):
		diagnostic += f"\n{exc}"
	try:
		log = frappe.log_error(
			title=FAILURE_TITLE, message=diagnostic, reference_doctype=RETRY_JOB, reference_name=name
		)
		frappe.db.commit()
	except Exception:
		frappe.logger("envision.retry_jobs").error("Could not persist a Retry Job's diagnostics.")
		return None
	return log.name if log else None
