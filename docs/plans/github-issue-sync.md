# GitHub ↔ Envision Issue sync

Status: implementation is ready for controlled manual testing on the development site. Python lint/format/compilation, frontend typecheck/targeted lint/format, production build and local migration passed after the final title fixes. Claude's focused follow-up review returned OK. Real GitHub/browser acceptance remains pending; the supplied HTTPS tunnel hostname currently fails DNS resolution from this environment, although its process was left running. The stage notes below are historical handoffs, superseded by the current verification record. Product scope is confirmed. The identity, deletion, disconnection, Status-exception and description-fidelity policies were **approved** on 2026-10-24 (§9, ADR 0008). Automatic reopening is not approved. P10 and the long-title policy (replacing P11's truncation) were approved on 2026-10-25. Implemented milestones and their verification are recorded below.

Current verification:

- Deployed the production frontend and Python app to local `erpdev.localhost`, then migrated successfully. Python Ruff checks/format and compilation pass. TypeScript, targeted frontend formatting and lint pass; the linter still reports non-blocking shadcn styling warnings. Full-repository formatting remains outside this change because of the previously noted unrelated `frontend/index.html` formatting.
- Final title fixes preserve complete titles, protect literal description text, and preserve the note marker through Envision's Paragraph extension. Missing, malformed, moved or duplicated markers produce a conflict instead of a guessed title/body write. Explicit title choices preserve ambiguous fragments as ordinary text. Claude's final targeted review returned OK.
- Outbound Markdown is produced by `markdownify`, not a custom serializer. No automated tests were added. The temporary mocked runtime-check script and its log were removed at the user's request and were not recreated.
- No GitHub App is configured on the development site, no Project has sync enabled, and the integration bot remains disabled. No real repository data was imported or published.
- Live registration/install callbacks, signed real deliveries, both sync directions, sub-issue limits, failure recovery and browser interactions still require a controlled test repository. The existing tunnel process remains running, but `returning-bones-minds-reno.trycloudflare.com` returned a DNS-resolution failure during the final reachability check; establish a working HTTPS URL before the GitHub walkthrough.
- Repository Issue polling is excluded by the current plan (§5). Undelivered webhooks therefore require GitHub redelivery; recorded receipts and operations retain their local retry/recovery paths.

Connection milestone progress: site-owned app registration/installation, encrypted credentials, repository discovery, signed webhook receipt, Project routing, two-way sync backend and frontend controls are implemented (ADRs 0006–0008, `docs/github-connection.md`). They are deployed and migrated locally with sync disabled; live GitHub acceptance is not complete.

Connection verification:

- Production frontend build/typecheck, targeted frontend lint/format, Python Ruff checks, and migration passed.
- One-off, rollback-only smoke checks (run manually, not added to the codebase) passed for manifest permissions and one-time state, encrypted PEM storage/JWT signing, safe credential-free responses, invalid-signature rejection, signed ping receipt/deduplication, and Guest permission denial. Temporary credentials and receipts were rolled back.
- The public webhook endpoint returned HTTP 401 for an unsigned POST, as intended.
- Existing suites could not execute: the frontend has no test files and the development Frappe site has testing disabled. No tests were added or enabled, and none are added for this feature unless the user explicitly asks.
- Full frontend `vp check` is blocked by pre-existing formatting in `frontend/index.html`; that unrelated file was not changed. Targeted checks for changed frontend files passed.
- Browser UI verification was unavailable because no debuggable Chrome connection could be established. The real GitHub registration/install round-trip remains pending the admin's browser login.
- Claude reviewed the connection milestone through AskClaude. Confirmed retention, callback recovery, diagnostics/redelivery, modal error visibility, and documentation findings were fixed and redeployed. Additional rollback-only smoke checks verified each backend fix. Claude's follow-up review found no new defects and returned OK to merge; live GitHub validation is still pending.

Stage 1 (routing foundation) progress, backend only (ADR 0007):

- Added **Envision GitHub Project Settings**: a hash-named route with unique, set-once `project` and `repository` (stable GitHub ID) Links, server-set attribution, and `sync_enabled` that stays 0 in this stage. Generic DocType access is read-only (System Manager, scoped to readable Projects by permission hooks that deny generic writes); the controller enforces manager role plus Project write access, a current app binding, an Envision-enabled Project, and an available, non-archived, Issues-enabled repository under an active installation owned by the app's account.
- Added the internal `setu/github/projects.py`: a Project-reader projection with `inactive_reason`, a manager-only candidate list that hides routed repositories, and connect/clear helpers under the shared connection lock that commit before releasing it. Routes are never remapped silently and survive loss of access. Project deletion and global app disconnect delete routes under row locks; the disconnect confirmation states how many it removes. Project merges are refused when either Project has a route; ordinary renames preserve the mapping.
- Not added, by decision: frontend mapping controls and whitelisted mapping endpoints wait for working sync. Inbound and outbound Issue sync, enabling sync, the privacy acknowledgement and the existing-label import remain pending, as do the proposed policies below.
- Verification: Ruff, Python compilation, DocType JSON parsing, frontend typecheck, production build and targeted format/lint passed. Deployed and migrated on local `erpdev.localhost`. Twenty-four rollback-only smoke checks passed against the migrated site: both unique indexes and duplicate directions, attribution, disabled sync, safe projection/candidate filtering, Administrator immutability, repository availability/archive/Issues checks, suspended installation, disabled Project retention, actual merges refused in both directions, ordinary rename preservation, Guest denial, Project deletion and global disconnect cleanup. GitHub settings/API calls were mocked for those routing checks; no real GitHub data changed and temporary database changes were rolled back. No automated tests were added (AGENTS.md). Concurrent-writer stress checks and real GitHub validation remain pending.
- AskClaude implementation review identified the Project merge bypass; the guard was added and verified on the site. Follow-up review returned OK with no stage 1 blocking defects. The existing HTTPS tunnel was left running.
- Next stage: resolve the remaining creation/fidelity policies, then implement durable Task/Issue identity and inbound creation/recovery. Mapping controls must stay unavailable until working sync and explicit privacy enablement ship together.

Stage 2 (two-way Issue sync backend) progress (ADR 0008). Written, but **not yet compiled, migrated or exercised**. The writer had no shell; the checks and manual scenarios are listed in the stage handoff.

- **Storage.** Envision GitHub Issue Sync (unique Task, Issue id and create marker; per-field baselines on both sides; conflicts; tombstones). Envision GitHub Operation (a transactional outbox with coalescing open keys, rerun, backoff and uncertain-create markers). Activation, checkpoint and pause fields on the route. Identifier-only Issue receipts and a Deferred status on deliveries. Site binding and subscribed events on settings, plus a binding backfill patch.
- **Publishing.** By tag on creation or later (Tag Link hook, Task API seam and recovery scan), with the whole Subtask tree, later Subtasks, and standalone tagged Subtasks. Uncertain creates are looked up by marker before any retry.
- **Importing.**
  - New Issues after activation import; Issues labelled `github` at activation import; pull requests are excluded.
  - Our own creates are recognised by marker.
  - Imports are recorded before they run.
  - Missed Issue webhooks are not recovered by polling GitHub.
- **Reconciliation.** Title, description, status and hierarchy are reconciled two ways, field by field, with the status exceptions (approved later) as conflicts. Saves run through normal Task validation as a disabled integration user, with the actor named in Activity. Keep Envision / Keep GitHub resolutions are recorded with the user.
- **Lifecycle.** Pause, resume and disconnect at both Task and Project level. Tombstones on delete, pauses on transfer, deletion, access loss and Project moves, never rerouting. Global and Project disconnect keep links. A cloned site's binding stops sync.
- **Endpoints and UI.** Permission-checked Project and Task endpoints are in `setu/api/github.py`. The frontend (Project Settings → GitHub, the Task GitHub panel, publish and backlog dialogs) is the next stage. The confirmed decision stands: no routing UI ships until it ships with working sync and the privacy enablement.
- **Policies.** P1, P2, P3, P5, P6, P7, P9 and one Issue per Task were approved on 2026-10-24 (ADR 0008). P10 and the long-title policy followed on 2026-10-25 (stage 6).

Stage 3 (completing the release backend) progress. Written with file tools only, so nothing has been compiled, migrated or run yet:

- **Descriptions.** The hand-written outbound serializer was replaced by markdownify (`setu/github/convert.py`, `docs/github-description-fidelity.md`). markdown-it-py and Frappe's sanitizer handle inbound bodies. Both libraries are declared in `pyproject.toml`.
- **Uncertain creates across operations.** The link now keeps `create_requested_at`. A create cancelled by Disconnect, or cleared from the operation log, is still looked up before any new create.
- **Interrupted creates.** A link paused, disconnected or tombstoned during an in-flight create records the Issue identity and keeps its state.
- **Duplicates.** An Issue with an already-linked Task's marker is never imported.
- **Sub-issue webhooks.** `sub_issue_added` receipts now record the parent's own repository.
- **Settled conflicts.** A title, status, parent or two-sided description conflict clears when both sides come to agree. Lossy description conflicts wait for a choice and report real loss codes.
- **Task API.** Its own publish calls can no longer fail a Task save.
- **Project Retry.** It also restarts a failed labelled-Issue import, which now runs only after the state it reads is committed.
- **Lint.** The two findings the parent's lint run reported (`client.py` RUF036, `inbound.py` I001) are fixed.
- **Still open.**
  - Frontend: Project Settings → GitHub, the Task GitHub panel, and the publish and backlog dialogs with the mention warning (written in stage 4).
  - GitHub endpoint and payload facts not yet verified against GitHub's documentation: the sub-issue REST endpoints and limits, `sub_issues` payload fields, `creator=<slug>[bot]` filtering, and `GET /app` events.
  - Frappe's Tag Link insert on `add_tag`, checked on the bench.
  - Compile, migrate and manual smoke checks.

Stage 4 (frontend) progress. Written with file tools only, so it has not been type-checked, linted, built or opened in a browser yet:

- **Data access.** `frontend/src/lib/github.ts` types every response of the Project and Task endpoints and the cache keys. A view polls while work is in flight (an import, pending operations, an uncertain create).
- **Project Settings → GitHub.**
  - Readers see the repository, its visibility and the sync state.
  - Managers (`can_manage`) also get the controls:
    - connect one repository no other Project uses (sync stays off);
    - **Turn on sync…**, which needs both acknowledgements and shows the mentions warning, missing events and the backlog with a publish-or-hold choice; a changed backlog is refused and shown again;
    - Pause, Resume, Retry failed, and Disconnect repository with a confirmation.
  - There are no Task routing controls.
- **Publishing.** Adding `github` on the Task page or in Create Task first confirms the repository, its visibility, the subtasks that go with it, and the mentions warning; the tag is saved only once confirmed. Create Task also says when a new subtask publishes with its parent.
- **Task page.** A GitHub block in the rail shows the state, the Issue, the last sync, pending work, an uncertain create, errors and conflicts. It offers only the actions the server allows. Conflicts are reviewed side by side; GitHub's Markdown is shown as text only.
- **Settings → GitHub.** It now shows the site-copy confirmation and missing webhook events, and its Disconnect text says links pause.
- **Not verified.** The type check, lint, build and every manual journey (stage handoff).

Stage 5 (integration fixes after release review 0) progress. Written with file tools only, so nothing has been compiled, type-checked, built or run:

- **Sub-issues created on GitHub** (the review's high-severity defect). They used to import as top-level Tasks: the `sub_issues` event arrived before the child's Task existed and was dropped. Now:
  - the event records an unknown child for import under the normal rules;
  - it keeps the parent on a link whose Task doesn't exist yet;
  - `import_issue` reconciles a recorded parent;
  - `observe_sub_issues` records parents on children still being imported, and an imported child records its own already linked parent, so import order doesn't matter.

  The child's row is read locked, after the parent's, which is the same order `import_issue` uses. A concurrent import therefore either sees the parent or is seen as having created the Task, and the two can't deadlock.
- **Uncertain-create lookup.** A marker now matches only an Issue whose author is this site's app bot (`<slug>[bot]`, type Bot). This also covers the fallback when GitHub refuses the `creator` filter. Without a known app name the lookup stays uncertain and never creates. The inbound check for "created by Envision" requires the same author.
- **Times.** `last_synced_at`, conflict `detected_on`, `activated_on` are ISO with the site's offset (`clock.site_iso`, as the timeline does), and the browser parser accepts them.
- **Polling.** `pending_operations` counts only Queued, Running, Retrying and Uncertain work, and only while the link is active and its route isn't blocked. `uncertain` follows the same rule. The Project view stops polling while its route is blocked.
- **Bulk actions.** Project Retry and publishing a held tree skip a link that is refused, rather than failing the whole request (`store.attempt`). A held tree publishes parents first. The Task itself must still publish, and its refusal is shown.
- **Labelled-import window.** It is documented rather than changed (ADR 0008, `docs/github-connection.md`). A delayed or retried labelled import also takes Issues labelled since activation, because GitHub doesn't say when a label was added.
- **Reviewed, no change:**
  - the copied-site confirmation reuses `confirm_site_url` behind its own explicit dialog;
  - the backlog-changed refusal is a plain `ValidationError`, and the UI reloads the preview after any refusal;
  - the preview's `missing_events` may be cached, but enabling checks GitHub live;
  - "publishing" polling is bounded by the five-minute recovery scan;
  - `bs4` comes with Frappe, as the existing `board_message.py` already assumes.
- **Product points to confirm** (not defects; current behaviour is conservative):
  - a brand-new Issue from a lossy description publishes markdownify's version with a `lossy_outbound` conflict, while the Task keeps its full version;
  - Keep GitHub on a not-planned close or a Blocked close marks the Task Done, where Cancelled might suit a not-planned close better;
  - tags added in Desk or through REST publish without the confirmation dialog.
- **Still pending:**
  - every executable check (install, type check, Ruff, compile, frontend type check, lint and build, migrate, console scenarios, rollback-only mocked checks);
  - GitHub API facts: sub-issue endpoints and payloads, `creator` filtering, Bot author type, `GET /app` events, `since` semantics, whether adding a sub-issue changes the parent's `updated_at`;
  - P10 and P11 approval (given in stage 6);
  - a live pilot on a test repository, only with the user's approval.

Stage 6 (long titles, P10) progress. Written with file tools only, so not compiled, linted or run:

- **Approved on 2026-10-25.**
  - **Long titles.** The user rejected P11's truncate-with-conflict default: the rest of a long title moves to the description, which says so.
  - **P10.** Existing or recovered Issues closed as completed import as Done through normal ERPNext validation. This was already implemented (imported Open, then reconciled), so only the docs changed. The not-planned, Blocked and reopen conflicts are unchanged.
- **Long titles** (`setu/github/titles.py`, ADR 0008 → Reconciliation → Titles).
  - The subject takes the first `Task.subject`-length characters, measured as Frappe stores them after sanitizing. A generated **GitHub title continuation:** paragraph at the top of the description holds the rest exactly, escaped as text, with a `data-github-title-continuation` marker.
  - GitHub's title is never shortened, and `base_title_remote` keeps it whole.
  - This applies on import and on later remote title changes. `title_too_long` is no longer raised.
  - The Task's title is the subject plus the note's text, and `base_title_local` keeps that whole title. Subject edits, note edits and note deletion are title edits, pushed whole; concurrent different edits conflict. A whole title over GitHub's 256 characters is an error and nothing is shortened.
  - The note is the first paragraph with the marker, or, after the editor drops the marker, the first paragraph starting with the label while the last synced title was longer than a subject. Other paragraphs with the label are description.
  - The description syncs without the note (baseline hashes, outbound bodies, conflict values), so the note never reaches GitHub. Remote body edits keep it. Remote title changes rewrite or remove only the note, and replays write nothing.
  - No schema change, custom editor node or Markdown code: markdownify still writes every body.
- **Still pending.** Ruff/type checks, compile and the manual scenarios in the stage handoff.

This is the first-release scope. `docs/plans/github-integration.md` remains the earlier PR-focused draft; its exclusion of Issue sync and its estimates do not apply to this plan. PR linking and automation are deferred.

## 1. Confirmed scope

- One customer-owned GitHub App per Envision site, installed on one organization/account. No central Unoplat relay.
- Each Envision-enabled Project can connect one GitHub repository, and each repository can connect to only one Project (one-to-one).
- An Envision Task with the standard Frappe document tag `github` creates a GitHub Issue. Adding the tag after Task creation must also trigger publishing.
- Every new GitHub Issue in a sync-enabled mapped repository creates an Envision Task, without requiring a GitHub label.
- All outbound Tasks use their Project's connected repository. There is no default/override selection or per-Task repository picker.
- Title, description, and Status synchronize in both directions after creation.
- Comments, general label/tag synchronization, assignees, PRs, and other Task fields are outside this release. The `github` tag is a local publishing trigger, not general label synchronization.
- Tasks remain standard ERPNext Task records. Authentication and permissions remain Frappe/ERPNext-owned.

## 2. Routing and identity contract

The one-to-one Project/repository mapping is confirmed, and the identity and lifecycle policies below were approved on 2026-10-24 (ADR 0008).

- A Project connects to at most one repository, and a repository connects to at most one Project. Enforce uniqueness on both sides in storage and backend validation, not just the UI.
- One Task links to one GitHub Issue.
- Resolve the outbound repository from the Project connection. Missing or inaccessible connections produce a visible waiting/error state.
- Persist the destination when preparing publication. Replacing the Project's repository requires an explicit disconnect/reconnect review; never silently reroute pending operations or existing links.
- No Task-level repository selection or transfer control is included in this release.
- Use stable GitHub repository and Issue IDs for identity; store repository name, Issue number, and URL as refreshable display data. Enforce uniqueness on the linked Task and remote Issue independently.
- Imported Tasks are linked before any outbound trigger can run. They do not require the `github` tag; adding it later must not create another Issue.
- Only ordinary Tasks participate: milestones, templates, and cancelled Tasks do not publish.
- Subtasks synchronize as GitHub sub-issues. When a Task has the `github` tag, its whole Subtask tree publishes with it, without tagging each Subtask, and each Subtask's Issue is linked under its parent's Issue. Subtasks added later under a published parent also publish. A tagged Subtask whose parent is not published publishes as a standalone Issue.
- Hierarchy synchronizes both ways: adding, removing, or moving a sub-issue on GitHub updates the Task's parent within the same Project, and the reverse. A parent's Issue must exist before its children are linked, so child operations wait on the parent's create operation. Envision allows unlimited Subtask nesting while GitHub caps sub-issue depth and children per parent; when a limit is hit, show a visible sync error rather than flattening the tree.
- Existing Issues that already carry the `github` label when a repository is connected import automatically as Tasks, with no preview or review step. Existing Issues without the label are not imported. Recovery must catch missed new Issues, not merely wait for another edit.
- A tag already present when a repository is connected must not silently publish a backlog. Show a pending-publication preview and require confirmation.

## 3. User journeys

### Admin setup

1. System Manager opens Settings → GitHub → Create GitHub App.
2. Envision submits a preconfigured manifest to GitHub. The admin creates the app under the intended organization and selects accessible repositories.
3. The backend exchanges the temporary code and stores credentials encrypted on this site.
4. Validate installation ownership against this site's app, refresh repositories, and show connection health.
5. Projects Manager/System Manager selects one unassigned repository for a Project, enables sync, and accepts the data-sharing warning. Existing Issues labelled `github` in that repository then import automatically.

Request repository Metadata read and Issues write; do not request Pull requests or Contents permissions for this scope. Validate exact manifest behavior, callback/session handling, and organization policy requirements in the spike. Use unpredictable one-time state bound to the initiating admin; no personal OAuth identity mapping is required for this release.

### Envision → GitHub

1. A permitted user adds `github` to a Task and reviews its Project's connected repository.
2. A durable outbound operation is committed with local state; no GitHub request runs inside the interactive save.
3. A worker creates the Issue, records its stable identity and link, and publishes the Task's sync status.
4. Later title/description/Status changes update the existing Issue.
5. Users see repository, Issue link, Pending/Synced/Conflict/Error/Paused state, last successful sync, and permitted retry/resolve controls on Task detail.

### GitHub → Envision

1. Receive a signed Issue webhook for an enabled repository and durably record the delivery.
2. A worker creates or locates the linked Task, reconciles current remote state, and saves through the ERPNext document lifecycle.
3. Store attribution as the GitHub integration bot plus the actual GitHub actor in activity metadata. This is not personal-account impersonation.
4. Later edits update that Task; echo events do not create another Task or write back unchanged values.
5. Issue-list reconciliation must exclude entries containing `pull_request`, because GitHub's Issues endpoints also return PRs.

## 4. Field contract

| Envision | GitHub | Policy |
|---|---|---|
| Task subject | Issue title | Two-way, field-level reconciliation. Approved: a title longer than the subject allows keeps its first characters in the subject and the rest in a **GitHub title continuation:** note in the description; GitHub's title is never shortened |
| Task description (sanitized HTML) | Issue body (Markdown) | Two-way with explicit conversion and preservation rules |
| Parent Task (Subtask) | Parent Issue (sub-issue link) | Two-way; parent and child stay in the Project's one connected repository |
| Completed / Done | Closed | Close the linked Issue |
| Open, Working, Pending Review, Overdue, Blocked | Open | Preserve local active Status; GitHub has no equivalent workflow columns |
| New inbound Issue | New Task | Open Issue → Open; an existing or recovered Issue closed as completed → Completed, through normal ERPNext validation (approved P10) |
| Remote open → closed | Completed | Approved: complete through normal validation, unless the Task is Blocked, the close is not planned or duplicate, or a conflicting local change needs review. Those cases become conflicts. |
| Remote closed → open | Open / Todo | Approved: a conflict when the Task is Done. Only an explicit Keep GitHub reopens the Task. |

Important: `CONTEXT.md` says Envision does not reopen Tasks, and automatic reopening is **not** approved. A Done Task returns to Open only when a person with write access chooses Keep GitHub on the conflict, as when moving a Done card back.

Further rules (approved):

- A GitHub close with reason `not_planned` or `duplicate` is a visible conflict, never silently Completed. A `completed` close follows normal completion rules.
- A remotely closed Blocked Task becomes a conflict. Do not silently erase the human blocker, and do not automatically reopen the Issue.
- Intermediate Envision Status changes do not rewrite the Task to Todo merely because its remote Issue remains open.
- Use normal document validation and the existing completion/assignment rules. Dependency or validation failures remain visible sync errors, not bypassed business rules.

### Description fidelity

- Keep native formats: Envision Task descriptions remain HTML; GitHub Issue bodies remain Markdown. Perform conversion server-side behind a small module in `setu/github/`, not in UI callers.
- Conversion stack (implemented in `setu/github/convert.py`; contract in `docs/github-description-fidelity.md`):
  - **`markdown-it-py`** for inbound GitHub Markdown → HTML.
  - **`markdownify`** for outbound Envision HTML → Markdown. It owns serialization; Envision only detects losses and private addresses before conversion, and checks the round trip after it. There is no custom Markdown writer (user decision).
  - **Frappe's existing HTML sanitizer** after inbound rendering.
- Before enabling description writes on a real repository, validate tables, task lists, fenced code blocks, images, and actual HTML produced by the existing editor (the console scenarios in the fidelity doc). Neither converter guarantees lossless GitHub Flavored Markdown round trips. Publishing confirmations must warn that `@mentions` and `#references` notify people and link Issues on GitHub. Attachment addresses are never copied.
- Preserve the original remote Markdown, last synchronized local HTML, and normalized comparison values.
- Define supported round-trip formatting before enabling description writes: paragraphs, headings, lists, links, emphasis, code blocks, and tables as supported by the existing editor.
- Sanitize imported HTML. Never copy private authenticated attachment URLs as though GitHub users can access them; do not automatically fetch arbitrary embedded URLs.
- Do not rewrite Issue bodies on unrelated title/Status updates.
- Detect unsupported or lossy edits and preserve both versions for resolution; do not silently flatten rich content. Include image/attachment and unsupported editor-node examples in the spike.

### Conflicts

- Retain last successfully synchronized values per field. Compare current local and remote values against that baseline.
- Change on one side only → apply that field to the other side. Equal changes on both sides → accept. Different changes to the same field → preserve both and flag Conflict.
- Independent edits to different fields can reconcile without overwriting each other.
- Conflict resolution offers Keep Envision / Keep GitHub for the affected field and records the user's decision.
- Serialize work per linked Issue/Task and reconcile current state before writing. GitHub does not provide a distributed transaction with Frappe; do not promise atomic or exactly-once cross-system updates.

## 5. Reliable processing

- Verify HMAC-SHA256 over the raw webhook body before parsing; require the configured app's installation and enabled repository.
- Durably insert a delivery keyed uniquely by `X-GitHub-Delivery`, acknowledge promptly, and process asynchronously after commit.
- Duplicate successful deliveries do nothing. Failed deliveries remain retryable; a repeated delivery ID must not permanently suppress recovery.
- Persist outbound intent in the local transaction. Enqueue after commit, with a scheduler recovering operations missed by queue publication or worker failure.
- Use operation records, expected values/hashes, and synchronized baselines to suppress echoes. Do not blanket-ignore all bot-originated activity.
- Serialize per link; reload current state when processing stale deliveries. GitHub timestamps alone are not sufficient conflict detection.
- Before retrying an uncertain Issue-create request, reconcile whether it already succeeded remotely. Use an opaque integration marker/operation identity and a documented lookup strategy; GitHub Issue creation has no general exactly-once guarantee. An ambiguous outcome requires investigation, not blind duplication.
- Bound retries with backoff; respect rate-limit headers and transient failures. Permission loss pauses work and produces actionable errors.
- Do not poll repository Issues or sub-issues to recover missed webhooks. Keep retries for received deliveries and recorded operations, and the one-time labelled import. Sub-issue changes are taken from the `sub_issues` payload.
- Track receiver failures separately from worker failures. GitHub redelivery addresses failed receipt; local retries address failed processing after successful receipt.

## 6. Storage and module layout

Envision-owned DocTypes are justified by integration configuration and remote identity gaps, not replacements for Task or Project:

- **Envision GitHub Settings** (Single): app identity, encrypted private key/webhook secret and any required credentials, connection owner, registered site URL.
- **Envision GitHub Installation** and **Repository**: stable external identity, owner, availability, and suspension.
- **Envision GitHub Project Settings**: one unique Project and one unique repository, plus sync enablement. This record owns the one-to-one mapping; do not duplicate routing configuration on Repository. Implemented in stage 1 (ADR 0007); sync enablement stays off until inbound sync exists.
- **Envision GitHub Issue Sync**: Task/Issue identity, pending destination, lifecycle state, last successful baselines, original Markdown, conflicts, errors, pause/tombstone metadata.
- **Envision GitHub Delivery**: bounded-retention inbound receipt and processing log.
- **Envision GitHub Operation**: durable outbound intent, operation identity, attempts, retry timing, and uncertain-result recovery.

Keep GitHub authentication, format conversion, synchronization rules, retries, and reconciliation behind a small integration module interface. UI callers should not implement sync logic.

Proposed locations:

- `setu/api/github.py`: permission-checked UI endpoints, stable GitHub callbacks, webhook receiver.
- `setu/github/`: credentials/client, connection, mapping, Issue reconciliation, conversion, outbound operations, recovery.
- `setu/hooks.py`: document/tag lifecycle integration, queue recovery, and reconciliation scheduler.
- `frontend/src/lib/github.ts`: frontend data access.
- Global Settings, Project Settings, and Task create/detail UI: connection, repository routing, sync status and conflict resolution.

Codebase-specific spike requirement: `setu/api/task.py:create_task` inserts the Task before calling `task.add_tag`. A creation-only Task hook will miss the publishing trigger. Verify Frappe tag-change events for Envision, Desk, and REST, and provide a recovery scan; do not rely solely on one frontend save path.

## 7. Security, permissions, and lifecycle

- System Manager manages app credentials and disconnect; Projects Manager/System Manager manages routing. Task actions still require appropriate Task permissions, with server-side enforcement of the destination's Project mapping.
- Imported Issue data becomes visible under ERPNext Task permissions, not GitHub membership. Explicitly warn admins about private-repository data exposure before enabling sync.
- Publishing copies the Task title and description to GitHub, possibly publicly. Show repository visibility and obtain an explicit publishing confirmation; do not assume a private Task's content is safe to export.
- Protect integration records, raw payloads, baselines, and errors with appropriate permissions; redact secrets and limit retention. Generic DocType endpoints must not bypass Task/Project access restrictions.
- Keep credentials server-only and encrypted. Backups must retain the site's encryption key. Pause integration on site clones/restores until an admin explicitly rebinds it, so cloned sites do not become competing writers.
- Approved: removing `github` after publication does not disconnect or delete. The explicit Pause and Disconnect actions stop sync. A disconnected Task never republishes when the tag is added again, and Resume relinks only its original Issue.
- Approved: deletion never deletes the other system's record. A minimal tombstone is kept, so retries and reconciliation cannot recreate a deliberately deleted Task or remote Issue.
- Any Issue transfer away from the Project's connected repository pauses its link for admin review. Preserve stable Issue identity; do not silently move a Task across Projects, retarget the Project connection, or create another copy.
- Repository removal, app suspension, and uninstall pause affected links while preserving history. Reconnection requires reconciliation before resuming writes.
- Project moves, mapping changes, and disabled Projects require explicit reconciliation/validation; never reroute an existing linked Task implicitly.

## 8. Delivery checkpoints and acceptance

1. **Connection and fidelity spike**: manifest round-trip on Frappe Cloud, credentials, webhook verification, tag lifecycle, editor/Markdown fidelity, reopening rules, and create-recovery strategy. Confirm the sub-issue REST endpoints, the `sub_issues` webhook event (added to the manifest's subscribed events), and GitHub's nesting and per-parent limits against GitHub's official documentation. Resolve proposed policy decisions and write ADR 0006 before committing the full implementation.
2. **Foundation and routing**: encrypted settings, repository discovery, unique one-to-one Project/repository connection, bot attribution, delivery log and durable outbound operations. The Project/repository route is implemented as a backend foundation (ADR 0007); bot attribution and durable outbound operations are not yet.
3. **Inbound creation**: new Issues, and existing Issues labelled `github` at connection time, become one Task each in the correct Project; duplicate deliveries and create echoes do not duplicate work; missed creation recovery works.
4. **Outbound creation**: tag on creation or later creates one Issue in the Project's connected repository, and the tagged Task's Subtask tree publishes as linked sub-issues; a missing connection waits visibly; uncertain creation is recoverable without blind retries.
5. **Core two-way updates**: title, supported descriptions, and approved Status policies; per-field conflicts, activity, completion/reopening bookkeeping, Task UI status.
6. **Hardening and rollout**: rate limits, inaccessible repos, uninstall/reinstall, deletes/transfers, site changes/clones, privacy review, reconciliation, administrator guide. Pilot on a nonproduction repository before enabling customer Projects.

An inbound-only pilot is a checkpoint, not completion of the confirmed two-way release. Re-estimate after the spike; the prior PR-only schedule is not a reliable estimate for this scope.

Verification follows `AGENTS.md`: do not add automated tests unless requested; run existing applicable checks and manually exercise the integration on a test site/repository. Acceptance includes both create directions, both update directions, one-to-one mapping enforcement, publishing to the Project's connected repository, tag added later, duplicate/reordered deliveries, network failure after remote creation, concurrent same-field edits, description fidelity, closure/reopening, and permission revocation.

## 9. Decisions

Approved by the user on 2026-10-24:

1. **One Issue per Task.** One-to-one Project/repository routing was already confirmed.
2. **Deletion and disconnection.**
   - Removing the tag after publication does not stop sync; Pause and Disconnect do.
   - Deletion never deletes the other system's record.
   - Disconnected Tasks never republish by themselves, and resume only their original Issue.
   - Already-tagged Tasks at setup are previewed and need confirmation. Existing labelled Issues import automatically (confirmed earlier).
3. **Status exceptions.** GitHub reopening, `not_planned` or `duplicate` closure, and closing a Blocked Task each need explicit conflict resolution.
4. **Descriptions.** Unsupported or lossy descriptions keep both versions for review rather than being silently flattened. Each field's conflict is resolved separately.
5. **Data sharing.** Accepted per Project, by the privacy and publication acknowledgements a manager gives when turning sync on.

Approved by the user on 2026-10-25:

6. **P10.** An existing or recovered Issue closed as completed imports as Done, through normal ERPNext validation.
7. **Long titles** (replaces P11's truncation with a conflict, which the user rejected). The rest of the title moves to the description, which says so. GitHub's title is kept whole.

Not approved:

- Automatic reopening of a Done Task.
- Any bypass of normal ERPNext validation.

## References

- Product vocabulary and current access/reopening constraints: `CONTEXT.md`.
- Existing ERPNext Task creation, tags, completion and validation: `setu/api/task.py`, `setu/hooks.py`.
- Earlier research: `docs/research/plane-github-integration.md` (do not treat inferred Plane behavior as verified implementation).
- GitHub App manifests: https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
- Issue webhook events: https://docs.github.com/en/webhooks/webhook-events-and-payloads#issues
- Issue REST endpoints, including PR filtering: https://docs.github.com/en/rest/issues/issues
- Webhook delivery identity, acknowledgment and redelivery: https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
