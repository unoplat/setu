"""The redelivery cron: asks GitHub to resend Issue deliveries that failed (docs/adr/0008).

GitHub does not redeliver by itself, and during an outage its delivery log is the
durable store. A redelivery keeps the original's GUID and goes through the webhook
request flow again (setu.github.events), so applying it twice is safe.

``Envision GitHub Settings.redelivery_cursor`` is a time: scans read newest first and
stop at it. A run's cursor only moves on when its scan got all the way there:

- A POST only says GitHub accepted the request, so a failed delivery holds the cursor at
  its own time until an attempt with its GUID succeeds, and so stays in every later scan
  until then, or until it is too old to redeliver. A redelivery that fails is simply
  still failed when the next run looks.
- With nothing failed it moves to the newest delivery read, but no later than
  ``SETTLE_TIME`` ago: a delivery that times out reaches the log after newer ones.

A rate limit or the run's bounds stop the run with the cursor as it was.
"""

import time
from datetime import UTC, datetime, timedelta
from functools import partial
from typing import NamedTuple

import frappe
import httpx
from githubkit import AppAuthStrategy, GitHub, Response
from githubkit.utils import UNSET
from githubkit_schemas.v2022_11_28.models import HookDeliveryItem

from setu.github import client, connection, events, store
from setu.github.client import GitHubError

CURSOR_FIELD = "redelivery_cursor"
FAILURE_TITLE = "GitHub redelivery failed"
PER_PAGE = 100
MAX_PAGES = 50
MAX_REDELIVERIES = 100
# Scheduled jobs die at 300 seconds, and one request can take 25.
RUN_BUDGET_SECONDS = 200
# https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks
REDELIVERY_WINDOW = timedelta(days=3)
SETTLE_TIME = timedelta(minutes=5)
SERVER_ERROR = 500
# GitHub documents no status code for a delivery that got no reply. This is what the
# field holds with no HTTP status to report, as in a timeout or a refused connection.
NO_RESPONSE = 0
TIMED_OUT = "timed out"


class Scan(NamedTuple):
	"""Deliveries back to the cursor, newest first."""

	deliveries: list[HookDeliveryItem]
	complete: bool
	"""It reached the cursor or the end of the log, so the cursor may move."""


def run_redelivery() -> None:
	"""scheduler_events. A scheduled Cron job's failure leaves no record, so it is logged here."""
	if not healthy():
		return
	try:
		redeliver()
	except GitHubError as exc:
		if not exc.rate_limited:
			log_failure(exc)
	except Exception as exc:
		frappe.db.rollback()
		log_failure(exc)


def healthy() -> bool:
	"""Redelivery can only succeed with MariaDB and Redis both up."""
	try:
		frappe.db.sql("SELECT 1")
		frappe.cache.ping()
	except Exception:
		return False
	return True


def redeliver() -> None:
	"""A site that is a copy of another must not act for the App."""
	settings = client.settings()
	if not settings.app_id or connection.binding_changed(settings):
		return
	started = time.monotonic()
	now = datetime.now(UTC)
	since = cursor_time(settings.redelivery_cursor, now)
	github = client.app_client()
	scan = scan_deliveries(github, since, started)
	failed = still_failed(scan.deliveries)
	send_redeliveries(github, failed, started)
	if scan.complete:
		store_cursor(next_cursor(scan.deliveries, failed, since, now))


def cursor_time(stored: str | None, now: datetime) -> datetime:
	"""Where the scan stops: the stored time, or the window's start if that is older or
	there is none. A delivery older than the window can't be redelivered."""
	floor = now - REDELIVERY_WINDOW
	try:
		value = datetime.fromisoformat(stored or "")
	except ValueError:
		return floor
	return max(value, floor) if value.tzinfo else floor


def out_of_time(started: float) -> bool:
	return time.monotonic() - started >= RUN_BUDGET_SECONDS


def scan_deliveries(github: GitHub[AppAuthStrategy], since: datetime, started: float) -> Scan:
	"""Read newest first, back to ``since``. Bounded in pages and time."""
	rest = github.rest(client.API_VERSION)
	deliveries: list[HookDeliveryItem] = []
	cursor: str | None = None
	for _page in range(MAX_PAGES):
		if out_of_time(started):
			return Scan(deliveries, False)
		response = client.send(
			None,
			False,
			partial(rest.apps.list_webhook_deliveries, per_page=PER_PAGE, cursor=cursor or UNSET),
		)
		page = client.parsed(response)
		deliveries.extend(delivery for delivery in page if delivery.delivered_at >= since)
		cursor = next_page(response)
		if not cursor or any(delivery.delivered_at < since for delivery in page):
			return Scan(deliveries, True)
	return Scan(deliveries, False)


def next_page[T, J](response: Response[T, J]) -> str | None:
	"""The next page's cursor, from the Link header."""
	url = response.raw_response.links.get("next", {}).get("url")
	return httpx.URL(url).params.get("cursor") if url else None


def has_failed(delivery: HookDeliveryItem) -> bool:
	"""A 5xx, or a delivery that got no reply. Any other refusal would only repeat."""
	return (
		delivery.status_code >= SERVER_ERROR
		or delivery.status_code == NO_RESPONSE
		or TIMED_OUT in delivery.status.casefold()
	)


def succeeded(delivery: HookDeliveryItem) -> bool:
	return httpx.codes.is_success(delivery.status_code)


def still_failed(deliveries: list[HookDeliveryItem]) -> list[HookDeliveryItem]:
	"""The failed attempts of subscribed Issue events no attempt of which has succeeded.
	Redeliveries share their original's GUID."""
	redelivered = {delivery.guid for delivery in deliveries if succeeded(delivery)}
	return [
		delivery
		for delivery in deliveries
		if delivery.event in events.ISSUE_EVENTS and has_failed(delivery) and delivery.guid not in redelivered
	]


def to_send(failed: list[HookDeliveryItem]) -> list[HookDeliveryItem]:
	"""One attempt per GUID, the oldest first, since those run out of window first."""
	by_guid = {delivery.guid: delivery for delivery in failed}
	return sorted(by_guid.values(), key=lambda delivery: delivery.delivered_at)[:MAX_REDELIVERIES]


def send_redeliveries(
	github: GitHub[AppAuthStrategy], failed: list[HookDeliveryItem], started: float
) -> None:
	"""A refused redelivery stays failed for the next run, and only the first in a run is
	logged. A rate limit is raised, which ends the run with the cursor as it was."""
	rest = github.rest(client.API_VERSION)
	first: GitHubError | None = None
	for delivery in to_send(failed):
		if out_of_time(started):
			break
		try:
			client.app_write(rest.apps.redeliver_webhook_delivery, delivery.id)
		except GitHubError as exc:
			if exc.rate_limited:
				raise
			first = first or exc
	if first:
		log_failure(first)


def next_cursor(
	deliveries: list[HookDeliveryItem], failed: list[HookDeliveryItem], since: datetime, now: datetime
) -> datetime:
	"""It never goes back. The oldest still failed holds it; otherwise it follows the newest."""
	if failed:
		candidate = min(delivery.delivered_at for delivery in failed)
	elif deliveries:
		candidate = max(delivery.delivered_at for delivery in deliveries)
	else:
		candidate = since
	return max(since, min(candidate, now - SETTLE_TIME))


def store_cursor(value: datetime) -> None:
	# Frappe commits the cursor when the scheduled job completes successfully.
	frappe.db.set_single_value(client.SETTINGS, CURSOR_FIELD, value.isoformat(), update_modified=False)


def log_failure(exc: Exception) -> None:
	"""A GitHub error's message is safe to store: errors carry no credentials or bodies."""
	detail = store.error_text(exc) if isinstance(exc, GitHubError) else None
	# run_redelivery catches failures and returns, so the scheduled job commits the log.
	store.log_safe(exc, FAILURE_TITLE, client.SETTINGS, client.SETTINGS, detail=detail)
