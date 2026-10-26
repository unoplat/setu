# Plan: GitHub integration, one GitHub App per site

Status: draft for review. Research basis: `docs/research/plane-github-integration.md`.

## 1. Goal and model

Connect Envision Tasks to the pull requests that deliver them. Every Envision site creates and owns its own GitHub App through GitHub's App Manifest flow, so each app's webhook, callback and setup URLs point at that site's own domain (for example `https://unoplat-technologies.m.frappe.cloud`). No Unoplat-run service sits in between.

Borrowed from Plane:

- Repositories map to Projects.
- `[TASK-…]` in a PR title or body means link and automate; a bare `TASK-…` means link only.
- Per-Project PR lifecycle → Status rules for six events (draft, opened, review requested, approved, merged, closed unmerged).
- One bot backlink comment on the PR.
- A per-tenant credentials record, like Plane's GitHub Enterprise form.

Done differently from Plane, because of its known failures:

| Plane | Envision |
|---|---|
| Operator creates the app by hand and copies secrets into env vars, which then drift from the DB (#8100) | Manifest flow. GitHub returns the secrets once and they live in one encrypted Single DocType |
| Requires non-expiring user tokens; the integration "stops working after a while" otherwise | v1 needs no user tokens. Later user tokens use refresh-token rotation |
| Optional webhook secret; time-window dedupe; duplicate bot comments (#9117, #9227) | Signature check is mandatory. Dedupe on `X-GitHub-Delivery`. The bot comment is found by a marker and edited, never reposted |
| Lossy two-way issue body sync (#9077, #9071, #9073) | No issue sync in v1 |
| Mappings are UI-only (#8906) | Mappings are ordinary DocTypes, so the REST API covers them |
| Guessable `state` (workspace slug) | Random one-time `state` in the cache, bound to the user, expires in 1 h |

## 2. Scope

**v1 (this plan)**

- Creating, installing and disconnecting the site's GitHub App.
- Webhook ingestion with signature verification, idempotency, a delivery log and recovery of failed deliveries.
- Installation and repository lifecycle.
- Repository ↔ Project mapping.
- PR ↔ Task linking: automatic from PR text, plus manual by pasting a PR URL.
- Pull requests section on Task detail.
- Opt-in PR → Status automation per Project.
- Optional backlink comment on the PR.

**Later, explicitly out of v1**

- Personal GitHub account connection (user OAuth) for attribution.
- Issue sync (either direction), commits/branches view, PR indicator on Board Cards, GitHub Enterprise Server/GHE.com.
- A manual "paste credentials" fallback form for admins who cannot use the manifest flow. This is cheap to add later because it writes the same Settings record.

## 3. Key flows

### 3.1 Create the app (manifest flow)

1. A System Manager opens **Settings → Integrations → GitHub** and chooses the owner:
   - *Organization* (recommended; the app survives staff turnover). They enter the org login and need to be an org owner or GitHub App manager.
   - *Personal account*.
2. The SPA calls `setu.api.github.start_app_creation(owner_type, org)`. The server:
   - Checks the System Manager role.
   - Creates `state = secrets.token_urlsafe(32)` and stores it in `frappe.cache` for 3600 s with `{user, purpose: "manifest"}`.
   - Returns the GitHub form URL and the manifest JSON:
     - org: `https://github.com/organizations/<org>/settings/apps/new?state=…`
     - personal: `https://github.com/settings/apps/new?state=…`
3. The SPA builds a hidden `<form method="post">` with a `manifest` field and submits it. GitHub requires a browser POST, so this can't be a fetch.
4. The admin reviews the app on GitHub and can edit its name. GitHub redirects to `redirect_url?code=…&state=…`.
5. `setu.api.github.manifest_callback` (GET, logged-in user; the `sid` cookie is SameSite=Lax, so it rides on this top-level redirect):
   - Pops `state` (one-time) and checks it belongs to `frappe.session.user`.
   - Calls `POST https://api.github.com/app-manifests/{code}/conversions` (no auth, must happen within 1 h).
   - Saves `id, slug, client_id, client_secret, pem, webhook_secret, owner, html_url` into **Envision GitHub Settings**. If `webhook_secret` is null, it generates one and `PATCH /app/hook/config`.
   - Records `site_url_at_creation = frappe.utils.get_url()`.
   - Redirects to `https://github.com/apps/<slug>/installations/new?state=<new state>`.

Manifest sent (URLs built from `frappe.utils.get_url()`):

```json
{
  "name": "Envision <site label, ≤34 chars total>",
  "url": "https://<site>/envision",
  "description": "Links Envision tasks to pull requests.",
  "hook_attributes": { "url": "https://<site>/api/method/setu.api.github.webhook", "active": true },
  "redirect_url": "https://<site>/api/method/setu.api.github.manifest_callback",
  "setup_url": "https://<site>/api/method/setu.api.github.setup_callback",
  "setup_on_update": true,
  "request_oauth_on_install": false,
  "callback_urls": ["https://<site>/api/method/setu.api.github.oauth_callback"],
  "public": false,
  "default_permissions": { "metadata": "read", "pull_requests": "write" },
  "default_events": ["pull_request", "pull_request_review"]
}
```

Notes on the manifest:

- **`public: false`**: the app installs only on its owner account. That's why the owner must be the org whose repos are linked. If someone needs several orgs, that is a later decision (`public: true`).
- **Permissions are the minimum.** `pull_requests: write` covers reading PRs and posting or editing the backlink comment. `issues`, `contents` and account permissions are not requested until a feature needs them. Each added permission later makes every installation re-approve.
- **`installation` and `installation_repositories` arrive without subscribing.** `installation_target` is not needed for an org-owned private app.
- **`callback_urls` is unused in v1.** It is registered now so personal account connection needs no manual app edit later. GitHub Apps' callback/setup URLs **cannot be changed through the API**.
- **Name:** default `"Envision " + first label of the host`, truncated to 34. GitHub validates uniqueness on its own form, so a collision is fixed there by the admin.

### 3.2 Install and link the installation

GitHub redirects to `setup_callback?installation_id=…&setup_action=install|update&state=…`. The handler:

- Requires a logged-in System Manager.
- When `state` is present, validates and pops it. On `setup_action=update` (repo selection changed, via `setup_on_update`), it accepts a missing state and only refreshes.
- Calls `GET /app/installations/{id}` with the **app JWT**. Because the app is per-site and private, any installation the JWT can see belongs to this site's app on its owner account. That is why the spoofed-`installation_id` risk GitHub warns about (relevant to shared public apps such as Plane Cloud's) doesn't require a user-OAuth check here. A guessed id simply 404s.
- Upserts **Envision GitHub Installation** and syncs its repositories (`GET /installation/repositories`, paginated).
- Redirects to `/envision/settings?github=connected`.

### 3.3 Webhook ingestion

Endpoint `setu.api.github.webhook` is `@frappe.whitelist(allow_guest=True, methods=["POST"])`. Frappe does not check CSRF for Guest. The handler:

1. `raw = frappe.request.get_data()`. Before parsing, it verifies `X-Hub-Signature-256` with HMAC-SHA256 and `hmac.compare_digest`, and returns 401 on a mismatch or when no app is configured.
2. Reads `X-GitHub-Delivery`. If an **Envision GitHub Delivery** row already exists, it returns 200 and stops.
3. Inserts the delivery row (`Queued`, event, action, installation id, payload) and then calls `frappe.enqueue("setu.github.events.process_delivery", queue="short", enqueue_after_commit=True)`.
4. Returns 202 well inside GitHub's 10 s limit.

The worker then dispatches by event. It ignores unknown installations, and ignores events whose `sender` is this app's bot (`<slug>[bot]`) to prevent loops. It marks the row `Processed`, `Ignored` or `Failed` with the error. Raised exceptions use RQ retries.

**Recovery:**

- GitHub never redelivers on its own. A scheduler job every 15 min calls `GET /app/hook/deliveries` since the last cursor, finds failed deliveries not yet `Processed`, and redelivers them with `POST /app/hook/deliveries/{id}/attempts`. Because the delivery id is stable across redeliveries, the dedupe from step 2 still holds.
- A **Resync** action on a PR re-reads it from the API.

### 3.4 Lifecycle events

| Event | Effect |
|---|---|
| `installation.created` | Upsert the installation (covers installs not started from Envision) |
| `installation.deleted` | Mark the installation removed and its repositories unavailable. Keep PR history read-only |
| `installation.suspend` / `unsuspend` | Toggle `suspended`. Automation and comments pause while suspended |
| `installation.new_permissions_accepted` | Refresh the stored permissions |
| `installation_repositories.added` / `removed` | Upsert or flag repositories. Handle an empty `repositories_removed` when switching from all repos to selected ones by doing a full resync |
| `github_app_authorization.revoked` | No-op in v1 (no user tokens) |

### 3.5 PR → Task linking

- **Reference pattern.** Task IDs are global ERPNext names (`TASK-2026-00001`), so unlike Plane no Project key is needed.
  - Pattern: `(?<![\w-])(\[)?(TASK-\d{4}-\d+)(\])?`, case-insensitive. A bracketed match automates; a bare match only links.
  - The prefix comes from Task's naming series, so a site with a custom series still matches. Verify against the ERPNext Task DocType in the spike.
  - Matches are confirmed with a DB lookup. Unknown IDs are ignored.
- **Scope rule.** A reference is accepted only when the Task's Project has the PR's repository mapped. This stops a public PR from attaching itself to an unrelated Project.
- **Where references are read:** PR title and body on `opened`, `edited`, `reopened` and `synchronize`. Branch names are deferred, because Plane doesn't document them either.
- **Link sources:**
  - `auto` links are recomputed on every edit, so removing a reference from the PR removes the link.
  - `manual` links come from pasting a PR URL in Envision and are kept until unlinked in Envision.
- **Activity:** each new link or unlink adds an Info Comment on the Task, for example "Linked pull request unoplat/setu#42". It then appears in Envision's Activity section through `setu/api/timeline.py`'s existing `info` kind and in Desk's timeline, with no timeline changes.
- **Backlink comment.** Optional per site, default on.
  - The bot keeps exactly one PR comment carrying `<!-- envision:links -->`. It lists the linked Task IDs and their Envision URLs.
  - It holds **IDs and links only, no Task titles**, so private planning text isn't copied to GitHub.
  - It is found by its marker and edited, never reposted.

### 3.6 PR → Status automation

- Each Project has an opt-in rule set. Each PR event maps to an Envision status or "no change":

  | PR event | Suggested default |
  |---|---|
  | Draft opened | — |
  | Opened / ready for review | In Progress (`Working`) |
  | Review requested | Review (`Pending Review`) |
  | Approved | — |
  | Merged | Done (`Completed`) |
  | Closed unmerged | — |

- **Events used:**
  - `pull_request`: `opened` (with `draft`), `ready_for_review`, `review_requested`, `closed` + `merged`, `reopened`.
  - `pull_request_review.submitted` with `state=approved`.
- **Only bracketed (automating) links move a Task.**
- **Several automating PRs on one Task:** "Merged → Done" applies only when no other automating PR on that Task is still open. Other events apply as they arrive.
- **Never move a Task backward** from Done, and never touch a Blocked Task automatically. Blocked is a human signal (compare `EnvisionTask.update_status`).
- **Saving the change:**
  - The Task is saved through the document with `flags.ignore_permissions`, under a dedicated **GitHub bot User** created on connect. Version history and Activity then read "GitHub changed Status". This mirrors Plane's legacy `actor = bot User`.
  - Existing `validate_task_links` and the `Completed` bookkeeping (`completed_on/by`) run as usual.
  - An Info Comment names the PR that caused the change.

## 4. Data model (ADR 0006 records why each is needed)

All DocTypes live in the Envision module and are prefixed `Envision GitHub …`, following ADR 0002 and ADR 0005.

| DocType | Kind | Fields |
|---|---|---|
| **Envision GitHub Settings** | Single | `app_id`, `app_slug`, `client_id`, `client_secret` (Password), `private_key` (Password), `webhook_secret` (Password), `owner_login`, `owner_type`, `app_html_url`, `site_url_at_creation`, `bot_user` (Link User), `post_backlink_comments` (Check, default 1), `deliveries_cursor`, `connected_by`, `connected_on` |
| **Envision GitHub Installation** | Normal, named by installation id | `account_login`, `account_id`, `account_type`, `repository_selection`, `suspended`, `removed`, `permissions` (JSON) |
| **Envision GitHub Repository** | Normal, named by GitHub repo id | `full_name`, `installation`, `private`, `archived`, `available` (false once removed from the installation), child table `projects` → **Envision GitHub Repository Project** (`project`) |
| **Envision Pull Request** | Normal, named `<repo_id>-<number>` | `repository`, `number`, `title`, `url`, `state` (Draft/Open/Merged/Closed), `author_login`, `head_ref`, `merged_at`, `closed_at`, `last_synced_at`, child table `tasks` → **Envision Pull Request Task** (`task`, `automate`, `source` auto/manual) |
| **Envision GitHub Project Rule** | Normal, one per Project | `project` (unique), `enabled`, one Select per PR event holding a Status or empty |
| **Envision GitHub Delivery** | Log | `delivery_id` (unique), `event`, `action`, `installation_id`, `status`, `attempts`, `error`, `payload` (JSON), plus `default_log_clearing_doctypes` set to 30 days |

Design notes:

- **Many repos ↔ many Projects** (a monorepo can serve several Projects). This is safe because Task IDs are global, so a reference resolves its own Project.
- **Rules are a separate DocType, not custom fields on Project.** Desk's Project form stays clean, and the rules can be read and edited over REST.
- **Password fields** are encrypted with the site's `encryption_key`.
  - Losing that key orphans the app, so document it with the site's backups.
  - The spike must confirm that Frappe Password storage accepts a ~1.7 KB PEM.
- **Deleting a Project** (allowed only without Tasks) deletes its rule and its repository mapping rows in `guard_project_delete`, as Modules and Links already do.
- **Uninstalling Envision** deletes these DocTypes. `before_uninstall` should call `DELETE /app/installations/{id}` where possible. The GitHub App itself must be deleted by the admin on GitHub (there is no API), so tell them that.

## 5. Backend layout

```
setu/api/github.py        # whitelisted endpoints only. The URL paths are a public contract
                          # registered in every site's GitHub App: never rename this module.
setu/github/
  client.py               # app JWT (RS256, iat-60s, exp+9min, iss=client_id),
                          # installation tokens cached in frappe.cache until expires_at-5min,
                          # retry once on 401, requests session with GitHub API headers
  manifest.py             # manifest builder, state helpers, conversion
  events.py               # process_delivery + dispatch table
  installations.py        # installation / repository sync
  pull_requests.py        # PR upsert, reference parsing, link reconciliation, backlink comment
  automation.py           # rules → Status changes
  recovery.py             # scheduled redelivery of failed deliveries
```

Endpoints in `setu/api/github.py`:

| Group | Endpoints |
|---|---|
| Called by GitHub | `webhook` |
| Browser redirects | `manifest_callback`, `setup_callback` |
| Connection (System Manager) | `get_connection`, `start_app_creation`, `install_url`, `resync_installations`, `update_webhook_url`, `disconnect` |
| Project repositories (Projects Manager) | `list_repositories`, `set_project_repositories`, `get_project_rules`, `set_project_rules` |
| Task (read/write on the Task) | `get_task_pull_requests`, `link_pull_request` (paste a URL), `unlink_pull_request`, `resync_pull_request` |

`hooks.py` additions:

- `scheduler_events` cron every 15 min for recovery.
- `default_log_clearing_doctypes` for deliveries.
- After-install creation of the bot User happens on connect, not on install.
- `doc_events` on Task `on_trash`: remove its PR link rows.

No new Python dependencies: Frappe already ships `PyJWT`, `cryptography` and `requests`.

## 6. Frontend

- **`settings.tsx` → new "GitHub" section** (`components/settings/github-settings.tsx`, data in `lib/github.ts` via `frappe-react-sdk`). It has four states:
  1. *Not connected*: owner choice (organization login / personal) and a **Create GitHub App** button.
  2. *Created, not installed*: **Install on GitHub**.
  3. *Connected*:
     - App name linking to GitHub, owner, installation status (suspended warning), repositories count.
     - Last webhook delivery time and status.
     - Toggle for backlink comments.
     - **Manage on GitHub** and **Disconnect**.
  4. *Site address changed* (`get_url() != site_url_at_creation`):
     - One-click **Update webhook URL** (`PATCH /app/hook/config`).
     - Step-by-step text, with a link to the app's settings page, for the callback and setup URLs that GitHub only lets you edit by hand.
- **`projects.$name.settings.tsx` → "GitHub" section:**
  - Repository multi-select from available repos.
  - The PR automation rules table (event → Status Select), with an enable switch.
  - Hidden when no app is connected.
- **Task detail (`projects.$name.tasks.$task.tsx`) → "Pull requests" section:**
  - Rows show state badge, `owner/repo#n`, title, author, Automates/Links tag and an external link.
  - **Link pull request** (paste URL) and Unlink for manual links. Auto links show "from PR text".
  - Refreshes on a `publish_realtime(..., after_commit=True)` event, following `setu/api/inbox.py`.
- **⌘K:** a "Link pull request" action on Task pages, with its shortcut shown, matching the keyboard-first convention.
- Envision never renders PR bodies; it shows titles only, like Links never fetching addresses (ADR 0005).

## 7. Permissions and privacy

- **Connection and disconnection:** System Manager only (CONTEXT.md: first-version Settings depend only on ERPNext roles).
- **Repository mapping and rules:** Projects Manager or System Manager.
- **Seeing a Task's PRs:** anyone who can read the Task. This means **PR titles from private repos become visible to every Task reader**. That's acceptable in the first version, where Project access is role-wide, but record it in ADR 0006 and revisit with Project membership.
- **Secrets:**
  - Never returned to the browser and never logged.
  - Delivery payloads are kept for 30 days for debugging. The delivery list is readable by System Manager only.
- **Inbound webhooks:** signature-verified and installation-checked. Payloads from unknown installations are ignored.

## 8. Phases and estimates (one engineer)

| # | Phase | Output | Estimate |
|---|---|---|---|
| 0 | Spike on the Frappe Cloud site | Manifest round-trip on `unoplat-technologies.m.frappe.cloud`. Confirm the PEM fits a Password field, the Lax cookie survives the GitHub redirect, the Task naming series, Guest POST raw body on FC. Write ADR 0006 | 1–2 d |
| 1 | Connection | Settings DocType, manifest/setup flows, client/token layer, Settings UI states 1–3, disconnect | 3–4 d |
| 2 | Ingestion | Webhook endpoint, delivery log, queue processing, lifecycle events, recovery job, last-delivery health | 2–3 d |
| 3 | Mapping | Repository DocTypes, Project settings section | 1–2 d |
| 4 | Linking | PR DocType, parsing/reconciliation, manual link, Task UI section, Info comments, backlink comment, realtime | 3–4 d |
| 5 | Automation | Rule DocType and UI, bot User, status transitions and guards | 2–3 d |
| 6 | Hardening | Site-URL-change flow, permission review, docs page for admins (incl. local dev via a tunnel with `host_name` set in site_config), release notes | 2 d |

Total is about **3–4 weeks**. Phases 0–4 alone give a usable "PRs on Tasks" release in about 2–2.5 weeks.

**Verification:** per AGENTS.md, no new automated tests unless requested. Each phase is checked end to end on the Frappe Cloud site against a test repo:

- create and install the app, then open, edit, review, merge and close PRs;
- redeliver a delivery from GitHub's UI (must be a no-op);
- tamper with a signature (must get 401);
- uninstall and reinstall;
- change repo selection.

Existing backend/frontend test suites are run after each phase.

## 9. Local development

GitHub can't reach `localhost`:

- Run a tunnel (`cloudflared tunnel --url http://localhost:8000` or smee.io for webhooks only).
- Set `host_name` in the dev site's `site_config.json` to the tunnel URL, so `get_url()` builds the manifest URLs correctly.
- Create a separate dev GitHub App per developer. App names are global, so a suffix like `Envision dev-<name>` avoids collisions.

## 10. Decisions to confirm

1. **App visibility:** `public: false`, so the app installs only on its owner org. Recommended; multi-org needs `public: true` and an installer check.
2. **Automation actor:** a dedicated GitHub bot User (recommended) vs Administrator plus an Info comment.
3. **Backlink comment content:** IDs and URLs only (recommended) vs including Task titles.
4. **Merge with several PRs:** Done only when all automating PRs are merged (recommended) vs on the first merge, like Plane.
5. **Repo ↔ Project cardinality:** many-to-many (recommended) vs one repo per Project.
6. **Private PR titles** visible to all Task readers in the first version: acceptable until Project membership arrives?
