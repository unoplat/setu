# GitHub Issue sync: identity, outbox, field reconciliation and explicit enablement

Stage 2 of docs/plans/github-issue-sync.md, on top of the site-owned app (ADR 0006) and the one-to-one Project/repository route (ADR 0007). It partly supersedes both: Issue webhooks are no longer Ignored, routes can now carry Issues once a manager turns sync on, and disconnecting keeps sync history instead of deleting routes' work.

## Records

- **Envision GitHub Issue Sync**: one Task ↔ one Issue. `task` is unique (empty once the Task is deleted), and so are `issue_id` (GitHub's stable id) and `create_marker`. `repository_id` is plain data fixed when the link is made, so a link outlives a disconnected catalog and is never rerouted. `create_requested_at` records a create that may have reached GitHub and is not linked yet. It also holds the display data (number, URL, repository name), the state (Pending, Synced, Conflict, Error, Paused with a reason, Disconnected, Tombstoned), the last synchronized values per field for each side, GitHub's last raw body, the parent last seen on GitHub, and one conflict row per field (child table **Envision GitHub Sync Conflict**).
- **Envision GitHub Operation**: the durable outbox. `create_issue`, `import_issue` and `reconcile` rows are written in the transaction that caused them, and enqueued only after it commits. A unique `open_key` (`link:kind`) collapses repeated triggers into one open row, and a trigger that arrives while the row is running sets `rerun`. The row also keeps attempts, `retry_at`, and `request_started_at`/`lookups` for uncertain creates. Rows hold no Task or Issue content. Finished rows are cleared after 30 days; open and failed ones are kept.
- **Envision GitHub Project Settings** gains:
  - activation and acknowledgement attribution;
  - `paused`;
  - the UTC activation time;
  - the labelled-import state and page;
    - `last_error`.
- **Envision GitHub Delivery** gains identifiers only: repository, Issue, number, parent, actor. It also gains a `Deferred` status. Titles, bodies and payloads are still never stored.
- **Envision GitHub Settings** gains:
  - `site_binding`: a hash of site and database name;
  - `subscribed_events`: the events the app is subscribed to.

Generic DocType access stays read-only. Issue Sync rows are visible only to readers of their Task, or of the Project once the row is a tombstone. Operations are visible only to Project readers. Envision's own endpoints return explicit projections and check Task or Project access themselves.

## Enabling is explicit

A route is created with sync off. Upgrades, patches and reconnections never turn it on. `setu.github.activation.enable` is the only writer of `sync_enabled`; the route controller refuses any other change. It requires:

- System Manager or Projects Manager, plus write access to the Project;
- a routable route, and an app subscribed to `issues` (checked live on GitHub);
- the privacy acknowledgement: Issues from the repository, private ones included, become Tasks readable by everyone who can read the Project's Tasks;
- the publication acknowledgement: tagged Tasks' titles, descriptions and Subtask trees are copied to GitHub, publicly if the repository is public;
- a backlog token equal to the preview's. The backlog is the Tasks already tagged `github` and their Subtasks. A changed backlog is refused, never published unseen. The manager publishes it or holds it. Held Tasks become `Paused(backlog_held)` links, which no scan publishes; each publishes only by an explicit Publish.

Activation then records Issues that already carry the `github` label for import, page by page so an interrupted import resumes.

## Publishing (Envision → GitHub)

- The `github` tag publishes a Task, whether added at creation or later.
  - **Detection.** The Task API adds tags after inserting the Task, so no Task hook sees them. Frappe's tag API (used by Envision, Desk and REST) inserts a **Tag Link** after writing `_user_tags`, so its `after_insert` hook is the trigger.
  - **Backstops.** The Task API also calls `setu.github.links.tags_changed` directly, and a five-minute scan finds tagged Tasks without a link.
  - **Idempotent.** All three paths are idempotent through the unique `task`.
- A published Task's whole Subtask tree publishes with it, and Subtasks added or moved under a published Task later publish too. A tagged Subtask whose parent is not published publishes as a standalone Issue.
- A Task links to at most one Issue, ever. Removing the tag changes nothing, and re-adding it never creates another Issue. Stopping is the explicit Pause or Disconnect (approved policy P6, below).
- Only ordinary Tasks publish: not milestones, templates or Cancelled Tasks.
- **Uncertain creates.** Each link has an opaque marker, kept in the Issue body as a hidden HTML comment.
  - **Before sending.** The send time is committed on the operation (`request_started_at`) and on the link (`create_requested_at`).
  - **After an unknown outcome** (timeout, dropped connection, server error, dead worker), every attempt first lists Issues the app's bot created since then and matches the marker. Each match must also have the app's bot (`<slug>[bot]`, type Bot) as author, including when GitHub refuses the `creator` filter and every recent Issue is read. This includes a later operation after a Disconnect and Resume.
  - **Sending again.** A new create is sent only after three lookups spread over at least ten minutes find nothing.
  - **Unfinished lookups.** A lookup that cannot finish stays uncertain.
  - **Duplicates.** An Issue carrying a marker that is already linked to another Issue is never imported as a Task.
  - **Links that stopped syncing.** A link paused, disconnected or deleted while its create was in flight records the Issue's identity but keeps its state.

## Importing (GitHub → Envision)

- **Receipts.** Signed `issues` and `sub_issues` webhooks are stored with identifiers only, and only for a repository routed to a Project through the installation that sent them. Receipt status:
  - Queued if the Project is syncing;
  - Deferred while its sync is off, paused or blocked (resuming requeues them);
  - Ignored otherwise.
  Workers use a per-Issue Redis lock, never the global connection lock.
- **Which Issues import.**
  - Imported: Issues created after activation, labelled or not, and Issues that carried the `github` label at activation.
  - **Labelled-import window.** The labelled import reads labels when it runs, normally right after activation. GitHub's Issue list does not say when a label was added, so a run that is delayed, interrupted or retried after a failure also imports older Issues labelled `github` in the meantime. Once the import is Done it never runs again, and later labels import nothing.
  - Never imported: pull requests, older unlabelled Issues, Issues already linked or tombstoned, and Issues Envision created. The last are recognised by their marker together with this site's app bot as author, even when the webhook arrives before the create is recorded. A marker alone proves nothing, because anyone can copy an Issue body.
- **How an import runs.** The link with the unique Issue id is recorded first. An `import_issue` operation then creates the Task as the integration user through the normal Task insert, so concurrent deliveries and the labelled import create one Task. A refused Task is a retryable error.
- **Closed Issues** (P10, approved). A closed Issue imports Open and is then reconciled. Completed or no reason means the Task completes under the normal rules; not planned or duplicate means a conflict.
- **Long titles.** A title longer than the Task subject continues in the description (Reconciliation → Titles).
- **Attribution.** Changes from GitHub are saved as the disabled, role-less user `envision-github@bot.invalid` with `ignore_permissions`, so every validation still runs. The Task's Activity names the GitHub actor. Nothing impersonates a person.

## Reconciliation

- Per field (title, description, status, parent), each side keeps its own last synchronized value. A run reads the Issue fresh and acts as follows:
  - a change on one side is copied to the other;
  - the same change on both sides is accepted;
  - different changes on both sides keep both values as a conflict.
- Our own writes come back with values equal to the new baselines, so they change nothing. That suppresses echoes without ignoring bot activity.
- Retrying is safe: a patched Issue whose local transaction failed is accepted as "both changed the same" next time.
- **Status.**
  - Done ↔ closed, as completed. Moving a Task between active statuses only updates the baseline; the Issue stays open.
  - A close on GitHub completes the Task through the normal save (open subtasks, dependencies and completion bookkeeping apply; a refusal is a visible error). Exceptions that need a person:
    - a close as not planned or duplicate (P2);
    - a close while the Task is Blocked (P3);
    - a reopen while the Task is Done (P1).
  - Envision never reopens a Task by itself (CONTEXT.md). Choosing Keep GitHub on a reopen conflict sets the Task to Open as that user's explicit, permission-checked choice, like moving a Done card back.
- **Titles** (`setu.github.titles`). An Issue title longer than the Task subject allows (ERPNext's `Task.subject` length, 140 characters by default) is not a conflict, and Envision never shortens it on GitHub:
  - the subject takes the title's first characters, and a generated paragraph at the top of the description holds all the rest, exactly and escaped as text: **GitHub title continuation:** …rest. This applies on import and whenever GitHub's title changes later. The subject is fitted as Frappe stores it: a title that looks like HTML is sanitized on save and can grow, so the subject takes fewer characters and the rest moves whole to the note. Sanitization and validation still run;
  - the Task's title is its subject followed by the note's text after "…". That whole title is what syncs: `base_title_local` keeps it and `base_title_remote` keeps GitHub's whole title. Titles compare as Frappe stores them, whitespace collapsed, so replays and echoes write nothing;
  - editing the subject, editing the note's text or deleting the note is a title edit. It is pushed as the whole title, and the Task keeps its subject and note as written. Concurrent different edits are a `both_changed` conflict holding both whole titles. Keep Envision pushes the whole Task title. Keep GitHub applies GitHub's title as above;
  - nothing shortens a title to fit GitHub. A whole Task title longer than GitHub's 256 characters is an error that changes neither side until it is shortened; at publish, the Issue is not created until then;
  - the note is not description. Its baseline hash, the Issue body and description conflicts all leave it out, and a description from GitHub keeps the current note. A title from GitHub rewrites the note, or removes it when the title fits; a note already right is left as it is;
  - which paragraph is the note: only a single first paragraph with `data-github-title-continuation="1"` and the continuation label qualifies. Frappe and Envision's Paragraph extension preserve that attribute. Literal label paragraphs are never silently stripped. Missing, moved, malformed or duplicated markers on a previously continued title produce a visible title conflict, and description writes wait. This also covers editors splitting the marked paragraph. Choosing a title repairs the marker while retaining ambiguous fragments as ordinary description text;
  - `title_too_long` is no longer raised. One recorded earlier applies GitHub's whole title at the next run if the Task's title has not been edited since.
- **Descriptions** follow docs/github-description-fidelity.md:
  - only a changed description is converted;
  - title and status updates never send a body;
  - lossy conversion in either direction, a body Envision cannot reproduce, or a body over GitHub's limit is a conflict (P5);
  - private Envision files and local links are never copied.
- **Hierarchy.**
  - Envision → GitHub: Envision attaches the Issue under its parent's Issue in the same repository, or detaches it.
  - GitHub → Envision: GitHub's parent is learned from `sub_issues` webhooks, taken from the payload as sent (the parent, the child and whether it was added or removed), and from imports. A removal clears only the parent it names, so a late removal never undoes a newer parent. At import each side records the link: a parent records its already linked children, and a child records its already linked parent (from `parent_issue_url`), so import order doesn't matter. GitHub's parent is applied through the normal parent rules.
  - **Sub-issues created on GitHub.** "Create sub-issue" sends the child's `opened` event and its `sub_issues` event together, so the child's Task usually doesn't exist yet. The `sub_issues` event then records the child for import itself if needed, under the same import rules. It keeps the parent on the Task-less link, and the import reconciles that parent once the Task exists.
  - A parent's Issue still being created makes the child wait.
  - GitHub's depth or count limits, a parent in another repository, or a parent that isn't synced are shown as a sub-issue error. The tree is never flattened.
- **Conflict resolution.** Keep Envision or Keep GitHub per field, recorded with the user and applied by the next run through the same save. A choice that cannot be applied is cleared, with the error shown.

## Reliability

- **One link at a time.** One worker job per link, serialized by a Redis lock. No database row lock is held across a GitHub request.
- **Failures.**
  - Rate limits (`X-RateLimit-Remaining: 0`, `Retry-After`, 429) set a per-installation backoff in Redis, and every worker respects it. They don't use an attempt.
  - Other failures back off exponentially (one minute, doubling, at most six hours) for up to eight attempts, then show an Error until someone retries. A 422 errors at once.
  - Permission loss pauses the link (`access_lost`).
- **Missed webhooks.** GitHub is not polled for missed events: neither repository Issues nor sub-issues. If GitHub never delivers a webhook, that change waits for the next event or edit on that Issue, and a missed sub-issue change waits for the next change to that link. A webhook that arrived but failed is retried. The one-time labelled import at activation remains supported.
- **Scheduled recovery** (setu.github.recovery), every 5 minutes: due and stale operations, the tag scan, unpublished Subtasks of published Tasks, Tasks changed after their last sync with nothing queued, and interrupted imports.

## Lifecycle

| Event | Result |
|---|---|
| Task deleted | Link becomes a tombstone (identity and marker kept, content cleared); its operations are cancelled. The Issue is untouched, and the Task is never re-imported. |
| Issue deleted, 404, 410 | `Paused(remote_deleted)`; nothing is recreated |
| Issue transferred | `Paused(transferred)`; the Task is not moved or copied |
| Task moved to another Project, or made a milestone, template or Cancelled | Paused (`project_changed` / `task_ineligible`); never rerouted |
| Project repository disconnected | Links `Paused(route_cleared)`, route removed. The same repository plus enabling again resumes them after a fresh comparison; a different repository leaves them `destination_changed` |
| Global app disconnect | Links `Paused(app_disconnected)` and kept |
| Repository access lost, suspended, archived, Issues off | Work waits with the route's reason and retries every 15 minutes; any write is preceded by a fresh read |
| Project paused | Webhooks deferred, work waits; resuming requeues received deliveries |
| Project deleted | Only without Tasks; its tombstones go with it |
| Project merge | Refused while either Project has a route or links |
| Site restored or cloned | A different site/database binding stops all sync before any GitHub call, until a System Manager confirms the site in Settings (`confirm_site_url`). Bindings are backfilled once by `setu.patches.v0_3.github_site_binding` |

## Approved policies

The user approved these on 2026-10-24. They are settled, not defaults awaiting review:

- **Identity.** One Issue per Task, ever. A link is never replaced, whatever its state.
- **P6** Removing the `github` tag after publication changes nothing. Only an explicit Pause or Disconnect stops a Task's sync.
- **P7** Deletion never deletes the other system's record. A deleted Task leaves a tombstone. A deleted Issue pauses its link (`remote_deleted`).
- **P9** A disconnected Task never republishes by itself, not through the tag, recovery or a parent's Subtask tree. Resume relinks only its original Issue. A create that may have reached GitHub is looked up first, even from a later operation, because the link keeps when it was sent (`create_requested_at`).
- **P1** Reopening a Done Task's Issue on GitHub is a conflict.
- **P2** Closing an Issue as not planned or duplicate is a conflict.
- **P3** Closing the Issue of a Blocked Task is a conflict.
  - Keep GitHub on a P1, P2 or P3 conflict applies GitHub's state as that user's explicit, permission-checked choice.
  - Keep Envision writes Envision's state to the Issue.
- **P5** Unsupported or lossy descriptions in either direction keep both versions for review and are never silently flattened. This includes presentation-only losses (docs/github-description-fidelity.md). markdownify writes outbound Markdown and markdown-it-py renders inbound bodies.

Approved on 2026-10-25:

- **P10** An existing or recovered Issue that is already closed as completed (or closed with no reason) imports as a Done Task. It is imported Open, then reconciled, so completion runs through normal ERPNext and Envision validation: open subtasks, dependencies and completion bookkeeping apply, and a refusal is a visible error. A not-planned or duplicate close is still a P2 conflict, and a reopen is still P1.
- **Long titles** (replaces the shipped default P11, which truncated with a `title_too_long` conflict; that default was rejected). The rest of a title longer than the Task subject moves to the description, which says so (Reconciliation → Titles above). GitHub's title is kept whole, and an edit to either part of the Task's title syncs as the whole title.

Still not approved:

- **Automatic reopening.** Envision never moves a Done Task back to an active status unless a person chooses Keep GitHub (CONTEXT.md).
- **Bypassing validation.** Every change from GitHub saves through normal ERPNext and Envision validation. A refusal is a visible error.

A conflict also clears when someone edits both sides to agree, for title, status, parent and two-sided description edits. A lossy description conflict always waits for a person's choice.

## Consequences

- **Upgrading.** Existing apps must subscribe to the **Sub-issues** webhook event on GitHub, and Settings warns while it is missing, and sync can't be turned on for a project without it, since sub-issue changes arrive only as `sub_issues` webhooks.
- **Data sharing.** Imported Issue data is readable under ERPNext's role-wide Task and Project permissions (CONTEXT.md), whatever GitHub's repository membership is. That is what the privacy acknowledgement covers.
- **Not exactly-once.** GitHub offers no transaction with Frappe. The guarantees are no duplicate Task per Issue, no duplicate Issue per Task, and never overwriting a concurrent change.
- **Out of scope.** Comments, labels, assignees and pull requests are not synced.
