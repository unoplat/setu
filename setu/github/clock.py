"""GitHub's UTC timestamps and Frappe's naive system-time datetimes, kept apart."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from frappe.utils import get_datetime, get_system_timezone


def utc_now() -> datetime:
	return datetime.now(UTC)


def parse(value: str | None) -> datetime | None:
	"""A GitHub timestamp ("2026-01-02T03:04:05Z") as an aware UTC datetime."""
	if not value:
		return None
	try:
		parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
	except ValueError:
		return None
	return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def iso(value: datetime) -> str:
	"""An aware datetime in GitHub's form, for ``since`` and stored checkpoints."""
	return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_system(value: datetime) -> datetime:
	"""An aware datetime as the naive system-time value Frappe stores."""
	return value.astimezone(ZoneInfo(get_system_timezone())).replace(tzinfo=None)


def from_epoch(seconds: float) -> datetime:
	return to_system(datetime.fromtimestamp(seconds, UTC))


def site_iso(value: datetime | str | None) -> str | None:
	"""A stored system-time value as ISO with its offset, for the browser to
	show in its own time zone (as setu.api.timeline.timestamp)."""
	if not value:
		return None
	return get_datetime(value).replace(tzinfo=ZoneInfo(get_system_timezone())).isoformat()


def to_utc(value: datetime | str) -> datetime:
	"""A naive system-time value Frappe stored, as an aware UTC datetime."""
	naive = get_datetime(value)
	return naive.replace(tzinfo=ZoneInfo(get_system_timezone())).astimezone(UTC)
