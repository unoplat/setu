# GitHub sync: transactions and trust boundaries

Frappe normally owns the transaction: successful POST/PUT requests and background/scheduled jobs commit; uncaught exceptions roll back. GET requests do not implicitly commit. Code that catches an exception must handle rollback itself.

Keep ordinary bookkeeping in the caller's transaction. In particular, webhook echo identity updates, pending-delete acknowledgements, merging into an existing inbound retry row, final import failure/stop state, releasing unused retry leases and the redelivery cursor/log do not need their own commits. The installation callback's `manager_action` owns its transaction; `complete_installation` must not commit a second time.

Jobs that depend on database writes must be queued **after commit**. `links.enqueue_push` already uses `enqueue_after_commit=True`. Lifecycle receipts and import jobs use `frappe.db.after_commit.add` with a best-effort queue callback; their durable recovery scans cover queue outages. Do not enqueue them earlier to avoid a commit warning.

## Deliberate transaction boundaries

Database rollback cannot undo a GitHub mutation. Redis locks also do not commit database writes: when a lock serializes writers, necessary writes must be committed **before releasing it**, not merely when Frappe later finishes the request/job.

The remaining manual commits implement these boundaries:

- **Connection and routing mutations** (`api/github.py:manager_action`, `github/projects.py`, `github/activation.py:enable/disable`, `github/events.py:process_delivery`): publish the database changes while the shared Redis connection lock is still held. Lifecycle processing also records its attempt before network I/O.
- **Manifest registration** (`github/connection.py:complete_manifest`): this is a GET callback. Persist the one-time app credentials before releasing the connection lock or preparing a subsequent installation URL that might fail. The state is session-bound and manager-only; do not generalize this exception into write-on-GET APIs.
- **Import checkpoints** (`github/activation.py:run_import/import_pages`): make the Running state visible to recovery, keep each page and its checkpoint atomic, and commit a retry row left by a page rollback before reading the page again. Finishing a stopped/failed import can rely on the job's final commit.
- **Inbound application and retry handoff** (`github/inbound.py`): applying/settling an Issue or recording its failure completes before releasing the per-Issue Redis lock. The commit before settlement also refreshes the database snapshot after GitHub requests, so concurrent retry rows are visible.
- **Outbound work** (`github/outbound.py`): the Redis link lock serializes pushes while SQL row locks are released before slow GitHub requests. Refresh the snapshot before consuming delta keys, so edits merged during I/O are not lost. Commit finished work, deletion or a durable retry handoff before releasing the Redis lock. Cron handlers commit one row's work before the generic cron proceeds to another.
- **Uncertain creates and remote identities** (`github/outbound.py:send_create/finish_create`, `github/comments.py:send_create/record_created`): persist the create attempt/marker before a non-idempotent POST. If the response is lost, the next run looks for that create rather than blindly posting again. Once known, the remote identity must survive rollback of a later delta key. A definite rejection clears the attempt durably before being raised again.
- **Comment deletion/publication activity** (`github/comments.py:delete_remote`, `github/outbound.py:finish_create`): later key failures must not resurrect a mapping to a deleted remote comment or lose the publication breadcrumb. Issue identity is committed before writing Task activity, also preserving Task-then-link lock ordering.
- **Manual retry intent** (`api/github.py:retry_link`, `github/activation.py:retry_project`): an individual enqueue can catch a failure and roll back. Bring existing retry rows due in a prior transaction so that rollback cannot undo the user's retry request. The final import enqueue can wait for the POST's automatic commit.
- **Generic retry leases** (`retry_jobs.py`): release stale-row locks before selecting in due-time order; publish lease claims and release `SKIP LOCKED` row locks before external handlers run. Settlement starts with a fresh snapshot and commits each row independently, so a later row's rollback cannot undo an earlier row. Unused leases are released as the job returns and need no extra commit.

The flagged boundaries have an explanation and a **rule-specific** `nosemgrep` annotation. This is not an integration-wide exclusion. Do not remove a boundary without tracing its callers, external side effects, concurrent writers and recovery path. Do not add a try/except solely to evade the manual-commit rule.

## Guest webhook exception

`setu.api.github.webhook` must accept a GitHub delivery without a Frappe login. It is POST-only; guest access is not a grant to arbitrary Frappe APIs.

Before dispatching the payload, `events.receive`:

1. Requires a configured app and encrypted webhook secret.
2. Enforces the body-size limit, including when Content-Length is missing.
3. Validates `X-Hub-Signature-256` against the original body using `githubkit.webhooks.verify`. The pinned library uses HMAC-SHA256 and `hmac.compare_digest`; JSON processing in the handler follows signature verification.
4. Validates delivery/event/installation identifiers and checks app/owner for installation lifecycle events.
5. Gates Issue events on a sync-enabled repository route whose stored installation matches the delivery. A link belonging to another Project is not modified.

Inbound changes fetch canonical Issue/comment state through the stored installation. Issue IDs are checked, and comments must belong to the expected Issue. Deletes instead require the signed delete event and the matching stored link; loss of read access is not treated as evidence of deletion. Lifecycle processing verifies the installation against this site's app/owner before recording canonical repository state.

These checks are why the guest-endpoint finding has a scoped exception. Signature verification authenticates the delivery, not a Frappe user; route and sync-state checks remain essential. Do not bypass CSRF globally, accept a request-supplied Task/user identity, or expose credentials/payloads in responses or logs.

## Integration-user exception

`github/bot.py:as_bot` changes attribution to a fixed `BOT_USER`, never an identity from the payload. The default integration account is created disabled, without a password or roles. The previous user and sync flag are restored in `finally`, including when validation raises.

Inbound callers gate the repository/Project/link before entering this context. They intentionally use `ignore_permissions=True` for integration writes but still run ordinary Task/Comment validation and parent/deletion rules. User switching is **not** an authorization check and must not be reused to authorize a browser endpoint. The two `frappe-setuser` exceptions cover entering and restoring this bounded context only.

These notes document the reviewed code boundaries, not an independent security-team certification. Changes to guest access, account provisioning, route gates or permission bypasses require renewed security review.

## Capability flags are not authorization

`projects.get_project_route` enforces Project read access, then computes `can_manage` from the manager role and the boolean write permission. A read-only viewer should receive `False`, not a permission exception. Assigning the boolean result explicitly makes its use clear to Semgrep; no suppression is needed.

Mutations independently call `require_route_permission` (manager role **and** Project write access), and Task actions use `task_doc(..., "write")`. Never substitute a client-visible capability flag for these checks.

## Official references

- [Frappe database transaction model and hooks](https://docs.frappe.io/framework/user/en/api/database#database-transaction-model)
- [Frappe background jobs and enqueue_after_commit](https://docs.frappe.io/framework/user/en/api/background_jobs)
- [Frappe document permission enforcement](https://docs.frappe.io/framework/user/en/api/document#doccheck_permission)
- [Frappe manual-commit rule and documented exceptions](https://github.com/frappe/semgrep-rules/blob/develop/rules/frappe_correctness.yml)
- [Frappe guest-endpoint review rule](https://github.com/frappe/semgrep-rules/blob/develop/rules/security/whitelisted.yml)
- [Frappe user-switching review rule](https://github.com/frappe/semgrep-rules/blob/develop/rules/security/authorization.yml)
- [GitHub webhook signature verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Semgrep rule-specific inline annotations](https://semgrep.dev/docs/ignoring-files-folders-code)
