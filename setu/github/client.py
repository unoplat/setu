"""GitHub requests through githubkit; errors never include credentials or response bodies.

githubkit signs the App JWT and fetches installation tokens itself, keeping both
in this process's memory (``TOKENS``, its ``MemCacheStrategy``) until shortly
before they expire. Nothing is stored in Redis: each web worker and job mints
its own, and a 401 drops them and retries once. Only the rate-limit backoff is
shared between processes, so a limited installation sends nothing until GitHub
said to retry.

A webhook applied in its request has to reply inside GitHub's 10 seconds, so
``bounded_requests`` shortens the timeouts, stops new requests once its budget is
spent, and sends no second request after a 401. Its failures are ordinary ones.
"""

import re
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from functools import partial
from typing import Final

import frappe
import httpx
import jwt
import pydantic
from githubkit import (
	AppAuthStrategy,
	AppInstallationAuthStrategy,
	BaseAuthStrategy,
	GitHub,
	Response,
	UnauthAuthStrategy,
)
from githubkit.cache import MemCacheStrategy
from githubkit.exception import (
	GitHubException,
	GraphQLFailed,
	RateLimitExceeded,
	RequestError,
	RequestFailed,
)
from githubkit.graphql import GraphQLNamespace, GraphQLResponse

SETTINGS = "Envision GitHub Settings"
API_VERSION: Final = "2022-11-28"
TIMEOUT = httpx.Timeout(20, connect=5)
# One token request and one call take at most about 6 seconds, and no call starts
# after the budget: the last can run to about 8, which leaves time for the database.
BOUNDED_TIMEOUT = httpx.Timeout(2, connect=1)
BOUNDED_BUDGET_SECONDS = 4
# When the running request's budget ends; None outside ``bounded_requests``.
BOUNDED_UNTIL: ContextVar[float | None] = ContextVar("github_bounded_until", default=None)
TOKENS = MemCacheStrategy()
RATE_LIMITED = "GitHub's rate limit was reached. Envision will retry automatically."
UNREACHABLE = "Could not reach GitHub. Please try again."
INVALID = "GitHub returned an invalid response. Please try again."
OUT_OF_TIME = "This webhook ran out of time to reach GitHub. Envision will retry automatically."
TOKEN_PATH = re.compile(r"/app/installations/\d+/access_tokens")
GRAPHQL_PATH = "/graphql"
# GraphQL's error types, as the REST status that means the same.
GRAPHQL_STATUS = {"NOT_FOUND": 404, "FORBIDDEN": 403, "UNPROCESSABLE": 422}

type JSONValue = str | int | float | bool | list[JSONValue] | dict[str, JSONValue] | None


class GitHubError(Exception):
	"""A failed GitHub request, safe to show.

	- ``uncertain``: the request may have reached GitHub (a write that timed out
	  or met a server error); a create must be looked up before it is retried.
	- ``rate_limited``: wait until ``retry_at`` (epoch seconds) without counting
	  an attempt.
	"""

	def __init__(
		self,
		message: str,
		status: int | None = None,
		*,
		retry_at: float | None = None,
		uncertain: bool = False,
		rate_limited: bool = False,
	):
		super().__init__(message)
		self.status = status
		self.retry_at = retry_at
		self.uncertain = uncertain
		self.rate_limited = rate_limited


def settings():
	return frappe.get_single(SETTINGS)


def app_login() -> str | None:
	"""The login GitHub shows as the author of what this site's app writes."""
	slug = settings().app_slug
	return f"{slug}[bot]" if slug else None


@contextmanager
def bounded_requests() -> Iterator[None]:
	"""GitHub requests in this block use the short timeouts and the shared budget."""
	token = BOUNDED_UNTIL.set(time.monotonic() + BOUNDED_BUDGET_SECONDS)
	try:
		yield
	finally:
		BOUNDED_UNTIL.reset(token)


def current_timeout() -> httpx.Timeout:
	return TIMEOUT if BOUNDED_UNTIL.get() is None else BOUNDED_TIMEOUT


def set_token_request_timeout(request: httpx.Request) -> None:
	"""githubkit builds its installation token request without the client, and so
	without any timeout. httpx runs this hook for every request, that one included."""
	request.extensions.setdefault("timeout", current_timeout().as_dict())


def new_client[A: BaseAuthStrategy](auth: A) -> GitHub[A]:
	# Never retry (a create may already have applied), never follow a redirect
	# (a PATCH would be resent as a GET), and never cache responses.
	return GitHub(
		auth,
		user_agent="Envision-GitHub",
		follow_redirects=False,
		timeout=current_timeout(),
		event_hooks={"request": [set_token_request_timeout]},
		cache_strategy=TOKENS,
		http_cache=False,
		auto_retry=False,
	)


def app_auth() -> AppAuthStrategy:
	doc = settings()
	if not doc.app_id:
		raise GitHubError("Connect a GitHub App first.")
	key = doc.get_password("private_key", raise_exception=False)
	if not isinstance(key, str) or not key:
		raise GitHubError("The GitHub App private key is missing. Reconnect the app.")
	# GitHub recommends the client ID as the JWT issuer; githubkit uses the app ID when given both.
	return AppAuthStrategy(None if doc.client_id else doc.app_id, key, client_id=doc.client_id or None)


def app_client() -> GitHub[AppAuthStrategy]:
	"""Authenticates as the App (JWT), for ``/app`` routes only."""
	return new_client(app_auth())


def unauthenticated_client() -> GitHub[UnauthAuthStrategy]:
	"""An unauthenticated client for the manifest conversion."""
	return new_client(UnauthAuthStrategy())


def installation_client(installation_id: str) -> GitHub[AppInstallationAuthStrategy]:
	"""Authenticates as the installation; ``/app`` routes still use the JWT."""
	if not (installation_id.isascii() and installation_id.isdigit()):
		raise GitHubError("Invalid GitHub installation ID.")
	return new_client(app_auth().as_installation(int(installation_id)))


def clear_tokens():
	"""Drop this process's JWT and installation tokens. Other processes keep
	theirs until they expire or meet a 401."""
	TOKENS.cleanup()


def app_call[**P, T, J](method: Callable[P, Response[T, J]], *args: P.args, **kwargs: P.kwargs) -> T:
	"""A read through a REST method of ``app_client()``, as githubkit's model."""
	return parsed(send(None, False, partial(method, *args, **kwargs)))


def app_write[**P, T, J](
	method: Callable[P, Response[T, J]], *args: P.args, **kwargs: P.kwargs
) -> Response[T, J]:
	"""An App or unauthenticated write returning an unparsed Response."""
	return send(None, True, partial(method, *args, **kwargs))


def installation_call[**P, T, J](
	installation_id: str, method: Callable[P, Response[T, J]], *args: P.args, **kwargs: P.kwargs
) -> T:
	"""A read through a REST method of ``installation_client(installation_id)``."""
	return parsed(send(installation_id, False, partial(method, *args, **kwargs)))


def installation_write[**P, T, J](
	installation_id: str, method: Callable[P, Response[T, J]], *args: P.args, **kwargs: P.kwargs
) -> Response[T, J]:
	"""A write returning an unparsed Response; the caller classifies parse failures."""
	return send(installation_id, True, partial(method, *args, **kwargs))


def installation_check[**P, T, J](
	installation_id: str, method: Callable[P, Response[T, J]], *args: P.args, **kwargs: P.kwargs
) -> None:
	"""A read that only has to succeed: its reply is not parsed."""
	send(installation_id, False, partial(method, *args, **kwargs))


def installation_mutation(installation_id: str, query: str, variables: dict[str, JSONValue]) -> None:
	"""A GraphQL write through ``installation_client(installation_id)``, with the same
	error mapping and rate-limit handling as a REST write."""
	github = installation_client(installation_id)
	send(installation_id, True, partial(graphql_request, github, query, variables))


def graphql_request(
	github: GitHub[AppInstallationAuthStrategy], query: str, variables: dict[str, JSONValue]
) -> Response[GraphQLResponse]:
	"""POST the query. GitHub reports GraphQL errors with status 200, so they are
	raised here, inside ``send``, for it to map."""
	response = github.request(
		"POST",
		GRAPHQL_PATH,
		json=GraphQLNamespace.build_graphql_request(query, variables),
		response_model=GraphQLResponse,
	)
	try:
		github.graphql.parse_graphql_response(response)
	except pydantic.ValidationError:
		raise GitHubError(INVALID) from None
	return response


def send[T, J](
	installation_id: str | None, writes: bool, call: Callable[[], Response[T, J]]
) -> Response[T, J]:
	"""Send ``call``, honouring and recording the installation's rate limit.

	While GitHub has asked this installation to wait, no request is sent: the
	caller gets a ``rate_limited`` error with the time to retry. A write is
	uncertain once it may have reached GitHub.
	"""
	until = backoff_until(installation_id) if installation_id else None
	if until:
		raise GitHubError(RATE_LIMITED, 429, retry_at=until, rate_limited=True)
	bounded_until = BOUNDED_UNTIL.get()
	if bounded_until is not None and time.monotonic() >= bounded_until:
		raise GitHubError(OUT_OF_TIME)
	for attempt in range(2):
		try:
			response = call()
		except pydantic.ValidationError:
			raise GitHubError("Envision could not build a valid GitHub request.") from None
		except GitHubException as exc:
			error = failure(exc, writes)
			if installation_id and error.rate_limited and error.retry_at:
				record_backoff(installation_id, error.retry_at)
			if error.status != 401 or attempt:
				raise error from None
			clear_tokens()
			if bounded_until is not None:
				raise error from None
			continue
		# Redirects are not followed, and githubkit returns them as successes.
		if not response.is_success:
			raise status_error(response.status_code, uncertain=False)
		return response
	raise GitHubError("GitHub request failed. Please try again.")


def parsed[T, J](response: Response[T, J]) -> T:
	try:
		return response.parsed_data
	except pydantic.ValidationError:
		raise GitHubError(INVALID) from None


def failure(exc: GitHubException, writes: bool) -> GitHubError:
	if isinstance(exc, GraphQLFailed):
		return graphql_error(exc)
	if isinstance(exc, RateLimitExceeded):
		return GitHubError(
			RATE_LIMITED,
			exc.response.status_code,
			retry_at=time.time() + max(1.0, exc.retry_after.total_seconds()),
			rate_limited=True,
		)
	if isinstance(exc, RequestFailed):
		status = exc.response.status_code
		# A server error after a write may still have applied it.
		return status_error(status, uncertain=status >= 500 and sent(exc.request, writes))
	if not isinstance(exc, RequestError):
		return GitHubError("GitHub request failed. Please try again.")
	cause = exc.exc
	# Raised while githubkit fetched the installation token: the request itself was never sent.
	if isinstance(cause, GitHubException):
		return failure(cause, False)
	if isinstance(cause, pydantic.ValidationError):
		return GitHubError("GitHub returned an invalid installation token.")
	if isinstance(cause, ValueError | jwt.PyJWTError):
		return GitHubError("The GitHub App private key is invalid. Reconnect the app.")
	if isinstance(cause, httpx.ConnectError | httpx.ConnectTimeout):
		return GitHubError(UNREACHABLE)
	if isinstance(cause, httpx.RequestError):
		return GitHubError(UNREACHABLE, uncertain=sent(cause.request, writes))
	return GitHubError("GitHub request failed. Please try again.", uncertain=writes)


def graphql_error(exc: GraphQLFailed) -> GitHubError:
	"""A GraphQL failure as the status its errors agree on. GitHub's messages are not
	kept: they can quote what the request named."""
	statuses = {GRAPHQL_STATUS.get(error.type or "") for error in exc.response.errors or []}
	status = statuses.pop() if len(statuses) == 1 else None
	return (
		status_error(status, uncertain=False)
		if status
		else GitHubError("GitHub request failed. Please try again.")
	)


def sent(request: httpx.Request, writes: bool) -> bool:
	"""Whether the failed request is the write, not githubkit's token request."""
	return writes and TOKEN_PATH.fullmatch(request.url.path) is None


def status_error(status: int, *, uncertain: bool) -> GitHubError:
	if status == 429:
		return GitHubError(RATE_LIMITED, status, retry_at=time.time() + 60, rate_limited=True)
	messages = {
		301: "This Issue moved to another repository on GitHub.",
		401: "GitHub rejected the app credentials. Check the app and reconnect if necessary.",
		403: "GitHub denied access. Check the installation's repository access and permissions.",
		404: "GitHub could not find this app, installation, repository or Issue, or it is no longer accessible.",
		410: "This Issue was deleted on GitHub.",
		422: "GitHub could not accept the request. Check the app configuration.",
	}
	return GitHubError(
		messages.get(status, "GitHub request failed. Please try again."), status, uncertain=uncertain
	)


def backoff_key(installation_id: str) -> str:
	return f"envision:github:ratelimit:{installation_id}"


def record_backoff(installation_id: str, until: float):
	ttl = int(until - time.time()) + 1
	if ttl > 0:
		frappe.cache.set_value(backoff_key(installation_id), until, expires_in_sec=ttl)


def backoff_until(installation_id: str) -> float | None:
	value = frappe.cache.get_value(backoff_key(installation_id), use_local_cache=False)
	if isinstance(value, int | float) and value > time.time():
		return float(value)
	return None
