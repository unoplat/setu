# Research brief: Plane's GitHub integration and the "one GitHub App per site" model

_Researched 2026-10-19. Sources: the public `makeplane/plane` repo (commit `6c16585`), `makeplane/developer-docs` (commit `1fe7033`), `makeplane/helm-charts` (commit `0a8ef06`), docs.plane.so, plane.so/pricing, the GitHub Docs article API (`https://docs.github.com/api/article/body?pathname=…`), and public makeplane/plane GitHub issues._

## 0. Main caveat: Plane's integration engine is closed source

- The current GitHub integration lives in **Silo**, a separate Node service. Plane ships it only as the commercial image `makeplane/silo-commercial` (`helm-charts/charts/plane-enterprise/values.yaml`, `services.silo.image: makeplane/silo-commercial`, ~L579-588). Issue makeplane/plane#9071 also calls it "the closed `makeplane/silo-commercial` image".
- `makeplane/plane-ee` and `makeplane/silo` both return 404 (private or missing). Silo source is not on npm either (`@plane/etl` and `@plane/silo-core` return 404).
- The public Community Edition repo only has the **legacy (2023) GitHub App code**: models in `apps/api/plane/db/models/integration/github.py`, and the install popup in `apps/web/hooks/use-integration-popup.tsx`. Older tags (e.g. `v0.13.2-dev`) also have `apiserver/plane/utils/integrations/github.py` and `apiserver/plane/api/views/integration/{base,github}.py`. That code is no longer the shipped product, but it shows the original design.
- **I did not decompile or inspect the proprietary Docker image.** Anything about Silo internals (signature verification code, delivery dedupe, queue topology, token caching) is inferred from docs, Helm env vars and bug reports. Each such claim is marked **[inferred]** or **[unverified]**.

---

## 1. Plane self-hosted GitHub setup (operator-created GitHub App)

**Primary source:** `makeplane/developer-docs/docs/self-hosting/govern/integrations/github.md`, published at https://developers.plane.so/self-hosting/govern/integrations/github.

### 1.1 Manual app creation, not a manifest flow
- The operator creates the app by hand: "Go to **Settings > Developer Settings > GitHub Apps** in your GitHub organization → **New GitHub App**" (L44-53). I found no reference to `app-manifests` or a manifest anywhere in the docs, the Helm chart or the CE repo. **Plane does not use the manifest flow.**
- After creating the app, the operator generates a client secret and a private key in the GitHub UI, base64-encodes the PEM (`cat private_key.pem | base64 -w 0`), and puts the values into `.env` or Helm values (L226-256).

### 1.2 URLs (GitHub Cloud)
Silo is mounted under `/silo` on the Plane domain. Helm ingress routes `PathPrefix(/silo/)` to `<release>-silo:3000` (`templates/ingress-nginx.yaml` L95-101, `ingress-traefik.yaml` L91-97). Silo env sets `SILO_BASE_PATH: "/silo"` (`templates/config-secrets/silo.yaml`).

| GitHub App field | Value | Doc line |
|---|---|---|
| Callback URLs (2) | `https://<domain>/silo/api/github/auth/callback` (org/installation connect) and `https://<domain>/silo/api/github/auth/user/callback` (personal account connect) | L56-62 |
| Expire user authorization tokens | **Must be opted OUT** ("Make sure to opt out of Expire user authorization tokens") | L68 |
| Setup URL (Post installation) | `https://<domain>/silo/api/github/auth/callback` (same URL as the first callback) | L70-77 |
| Redirect on update | **On** | L81 |
| Webhook URL | `https://<domain>/silo/api/github/github-webhook` | L83-88 |
| Request user authorization (OAuth) during installation | Not mentioned. Because Plane sets a **Setup URL**, this option must be **off**: GitHub says that if it is selected "you will not be able to enter a URL here [Setup URL]" (GitHub Docs, *Registering a GitHub App*, step 12). **[inferred]** | — |
| Webhook secret | **Not mentioned in the self-hosted GitHub Cloud guide.** The Helm chart has an optional `GITHUB_WEBHOOK_SECRET`, added in Plane-EE v3.1.0 (helm commit `1b568bb`, 2026-08-12). Its README says it is "used to verify webhook payload signatures" (`charts/plane-enterprise/README.md` L1036). The generic env-var doc lists `WEBHOOK_SECRET` (default `plane-silo`) for "verifying webhook payloads from external integrations" (`environment-variables.md` L262). | — |
| Public app | Troubleshooting says "Invalid request callback URL" can mean "the GitHub App is not marked public" (L321-326). | |

GitHub Enterprise Server and GHE.com use different paths: callbacks `/silo/api/oauth/github-enterprise/auth/callback` and `/silo/api/oauth/github-enterprise/auth/user/callback`, setup URL is the same as the first callback, and the webhook is `/silo/api/github-enterprise/github-webhook` (L111-165). Plane Cloud uses `https://silo.plane.so/api/...`.

### 1.3 Permissions (L174-191)
| Scope | Permission | Access |
|---|---|---|
| Repository | Issues | Read & write |
| Repository | Metadata | Read-only |
| Repository | Pull requests | Read & write |
| Account | Email addresses | Read-only |
| Account | Profile | Read & write (as documented; looks broader than needed) |

There are no organization permissions and no `contents` permission. Commits and branches arrive through the `push` webhook only.

### 1.4 Subscribed events (L193-210)
`installation_target`, `meta`, `issue_comment`, `issues`, `pull_request`, `pull_request_review`, `pull_request_review_comment`, `pull_request_review_thread`, `push`, `sub_issues` ("Repository sub issues").
(GitHub always delivers `installation`, `installation_repositories` and `github_app_authorization` to apps; see §5.)

### 1.5 Operator env vars
- Docs (L248-252, `environment-variables.md` L139-147): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_NAME` (the app name or slug used to build `https://github.com/apps/<name>/installations/new`), `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` (base64 PEM).
- Helm also has `GITHUB_WEBHOOK_SECRET` (`templates/config-secrets/silo.yaml`, `values.yaml` L609-616, L1114-1115).
- Supporting Silo secrets: `SILO_HMAC_SECRET_KEY` (API↔Silo request signing; `environment-variables.md` L119), `AES_SECRET_KEY` / `AES_SALT` (encrypting stored credentials; shared by api, silo and pi), `DATABASE_URL`, `REDIS_URL`, `AMQP_URL` (RabbitMQ), `SILO_API_BASE_URL`, `APP_BASE_URL`, `INTEGRATION_CALLBACK_BASE_URL` (defaults to `WEB_URL`), `DEDUP_INTERVAL` (default 3 s, "deduplication of integration events"), `BATCH_SIZE`, `MQ_PREFETCH_COUNT` (`environment-variables.md` L257-266).
- Env values are **copied into the database** as "application secrets". Troubleshooting for "Application secret value not found for key: x-github-id" says to delete Redis key `plane_app_details_github`, set `SILO_BASE_URL`, and run `python manage.py reset_marketplace_app_secrets` in the API container (L332-339). Issue #8100 shows that editing `plane.env` did not reach the containers or DB until the operator re-ran the update.

### 1.6 GHE.com / GHES: per-workspace app credentials in the UI (closest to Envision's model)
docs.plane.so/integrations/github.md (GHE tabs, ~L75-160): for GitHub Enterprise, the workspace admin enters these in a form: **App ID, App slug / App name, Enterprise slug or Base URL, Organisation ID (GHE.com), Client ID, Client secret, Webhook secret, Private key**. "Plane stores these credentials tied to your workspace and uses them to authenticate API calls and verify webhook signatures." So Plane already supports a **DB-stored, per-tenant GitHub App** for Enterprise, while GitHub Cloud uses one env-configured app per instance.

---

## 2. Architecture

| Concern | What Plane does | Confidence |
|---|---|---|
| Webhook receiver | **Silo** (Node, port 3000, path prefix `/silo`) receives all GitHub webhooks at `/silo/api/github/github-webhook`. Silo "handles OAuth flows, webhook processing, and API communication with external systems" (`developer-docs/docs/self-hosting/plane-architecture.md` L49-50). | Verified (docs) |
| Async processing | Silo depends on RabbitMQ (`AMQP_URL`, `MQ_PREFETCH_COUNT`) and Redis. The Helm chart also has `automation-consumer`, `webhook-consumer` and `outbox-poller` workers (values.yaml L149, L1462). Webhooks are probably acked and then processed from a queue. | [inferred] |
| Install → workspace link | The user clicks Connect, goes to `https://github.com/apps/<GITHUB_APP_NAME>/installations/new?state=…`, and GitHub redirects to the Setup URL `/silo/api/github/auth/callback?installation_id=…&setup_action=install&state=…`. Then "Plane has stored the GitHub App installation ID and fetched your organization's details" (docs.plane.so/integrations/github). The legacy CE code still in `apps/web/hooks/use-integration-popup.tsx` L25-26 builds `https://github.com/apps/${github_app_name}/installations/new?state=${workspaceSlug}`. **The state there is the plain workspace slug, which is guessable.** Legacy `apiserver/plane/api/views/integration/base.py` L113-126 (v0.13.2-dev) accepts `installation_id` from the client and only calls `GET /app/installations/{id}` with the app JWT. It does **not** check that the installing user owns that installation, which GitHub explicitly warns against (see §5). How current Silo verifies the state is unknown. Plane recently merged "[INFRA-1158] fix(security): require a non-empty matching OAuth state" (makeplane/plane PR #10069, 2026-10-16), so state handling is being tightened. | Partly verified |
| One org ↔ one workspace | "One GitHub organization can be connected to one Plane workspace. If an organization is already connected to another workspace anywhere in Plane, the connection attempt fails" (docs.plane.so/integrations/github.md L42). This implies a uniqueness constraint on installation/account id. | Verified (docs) |
| User-level connection | Separate OAuth web flow with callback `/silo/api/github/auth/user/callback`. Members connect personal accounts so that "comments made in Plane will appear in GitHub under your GitHub user account, else comments will be posted as Plane GitHub App or your custom GitHub app name." Users are matched through a "user map". | Verified (docs) |
| Token handling | App JWT → installation access token (1 h). User-to-server tokens are stored and expected **never to expire**: operators must opt out of token expiry, and the troubleshooting entry "GitHub integration suddenly stopped working after a while" is fixed by opting out and reconnecting (dev-docs L341-345). So Silo did **not** implement refresh-token rotation for user tokens, at least historically. Legacy CE JWT code (`apiserver/plane/utils/integrations/github.py` L11-27, v0.13.2-dev) signs RS256 with `iss=app_id`, `exp=now+10min`, `iat=now` (no clock-skew backdating), and fetches a new installation token on every call (no caching). | Verified (docs/legacy) / Silo internals [unverified] |
| Credential storage | Postgres. Workspace connection credentials are encrypted with `AES_SECRET_KEY` + `AES_SALT` ("api, silo and pi all default to 'aes-salt'… emitting an empty value would break decryption", `templates/config-secrets/silo.yaml`). App-level secrets are cached in Redis (`plane_app_details_github`). Legacy CE stored `config={"installation_id": …}` in `WorkspaceIntegration.config` (JSONField) and `GithubRepositorySync.credentials` (JSONField). | Partly verified |

---

## 3. Features and data model

### 3.1 Mapping and linking (docs.plane.so/integrations/github.md)
- **Repo ↔ project** ("Project Issue Sync", L190-215): an admin picks a Plane project and a GitHub repo, maps *Issue Open → state* and *Issue Closed → state*, and chooses **Unidirectional** (GitHub → Plane, which overwrites Plane) or **Bidirectional**.
- **Opt-in by label**: a GitHub issue with label `plane` becomes a Plane work item. A Plane work item with label `github` becomes a GitHub issue. A cross-link comment is posted on both sides (L28, L43, L222-245).
- **Synced fields**: title, description, assignees (only mapped users), labels (created if missing), state (open/closed ↔ mapped states), comments (attributed if the user is mapped, otherwise posted by the bot), mentions (mapped users, otherwise a GitHub profile link), and issue links (GitHub → Plane only) (L258-275).
- **PR ↔ work item** (L300-335):
  - `[WEB-344]` (with brackets) in the PR **title or description**: link, bot comment, and **state automation**.
  - `WEB-344` (no brackets): **link only**, bot comment, no state change.
  - Branch names are not documented as a trigger. **[unverified]**
- **PR lifecycle → state mapping**, configured per project: *draft opened, opened, review requested, approved/ready to merge, merged, closed without merge*.
  - These presumably come from `pull_request` actions (`opened` with `draft`, `ready_for_review`, `review_requested`, `closed` + `merged`) and from `pull_request_review` `submitted`/`approved` for "ready for merge". **[inferred]**
  - Workflow rules can block a transition; the bot then comments "⚠️ State transition attempt blocked by project workflow settings" (issue #9227).
- **Legacy CE data model** (`apps/api/plane/db/models/integration/github.py`), still in the open schema:
  - `GithubRepository(name, url, config JSON, repository_id BigInt, owner)`
  - `GithubRepositorySync(repository 1:1, project, credentials JSON, actor=bot User, workspace_integration FK, label FK)`, unique `(project, repository)`
  - `GithubIssueSync(repo_issue_id, github_issue_id, issue_url, issue FK, repository_sync FK)`, unique `(repository_sync, issue)`
  - `GithubCommentSync(repo_comment_id, comment FK, issue_sync FK)`
  - Newer Plane models use `external_source` / `external_id` on issues and comments (issue #9077 discusses comments with `external_source="GITHUB"`).

### 3.2 Avoiding sync loops [inferred from issue reports]
- Label gating plus stored external ids. Issue #9077 found Plane suppresses no-op pushes: "PATCH with a no-op value — suppressed when stored state matches GH". So each push is compared with the last-synced state.
- Silo also has a dedup window `DEDUP_INTERVAL=3s`, which is the likely echo/debounce guard.
- These guards are imperfect. Bot comments got duplicated (#9227 duplicate "Linked to Plane Work Item(s)" comments in the same minute; #9117 repeated on every commit, fixed in 2.6.2). Round-tripping markdown ↔ TipTap HTML corrupted GitHub bodies (#9077, #9071 mentions rewritten as `[From GitHub: user](…)`, #9073 images replaced by auth-gated silo URLs and 5-minute presigned links).

### 3.3 Edition
- GitHub integration is **Pro and above**: docs badge `<Badge text="Pro">`, and plane.so/pricing lists GitHub and GitHub Enterprise as Free: unavailable; Pro, Business and Enterprise: available.
- The Community Edition (AGPL) only contains the legacy, essentially dead GitHub importer/sync code.
- Silo runs only in the commercial image.

---

## 4. Webhook handling (Plane)

- **Signature verification:**
  - GHE/GHES: Plane says it uses the per-workspace webhook secret to "verify incoming webhook signatures" (docs.plane.so).
  - GitHub Cloud self-hosted: verification only became configurable through `GITHUB_WEBHOOK_SECRET` in Helm in Aug 2026, and the dev docs still don't tell operators to set a secret. Before that, cloud webhooks on self-hosted installs were probably unverified or used a default secret. **[unverified; flag as a risk Plane carried]**
- **Idempotency:** I found no public evidence that Silo dedupes on `X-GitHub-Delivery`. There is only a time-based `DEDUP_INTERVAL`, and the duplicate-comment bugs (#9227) suggest dedupe is not delivery-id based. **[unverified]**
- **Queues / retries:** RabbitMQ-backed consumers (§2). GitHub never auto-retries failed deliveries (§5). No public evidence that Plane re-polls failed deliveries through `GET /app/hook/deliveries`. **[unverified]**
- **Install lifecycle:**
  - Subscribing to `installation_target` handles org renames.
  - `installation` (created/deleted/suspend/unsuspend/new_permissions_accepted) and `installation_repositories` (added/removed) arrive by default. How Silo reacts to them is **[unverified]**.
  - Legacy CE uninstalled from the Plane side with `DELETE /app/installations/{id}` (`delete_github_installation`, v0.13.2-dev `utils/integrations/github.py`).
- **Reverse proxy:** everything lives under `/silo/`. Path-prefix routing must forward that prefix intact (Silo expects `SILO_BASE_PATH=/silo`). Issue #8100 shows the UI "Configure" button doing nothing when env/DB secrets were missing; Silo logs show `/silo/api/github/auth/organization-status/<workspace-id>`.

---

## 5. GitHub App Manifest flow and token facts (official GitHub Docs)

Source pages are listed after the table.

| Topic | Fact |
|---|---|
| Start URL | Browser **POST** (HTML form) to `https://github.com/settings/apps/new?state=…` (personal) or `https://github.com/organizations/ORG/settings/apps/new?state=…` (org). The form field `manifest` holds JSON-encoded parameters [M]. GHE.com uses `https://<sub>.ghe.com/…`, GHES uses `https://<host>/…`. |
| Manifest params | `name`, `url` (**required**), `hook_attributes{url (required), active (default true)}`, `redirect_url`, `callback_urls` (≤10), `setup_url`, `description`, `public`, `default_events`, `default_permissions` (`{"issues":"write",…}`), `request_oauth_on_install`, `setup_on_update` [M] |
| Not settable by manifest | "Expire user authorization tokens" (on by default; GitHub "strongly recommends" leaving it on [R]) and the webhook secret (GitHub **generates** it [M]). Apps created by manifest therefore **will issue expiring user tokens**, unlike Plane's required config. Client secret and PEM are generated too. |
| `state` | "An unguessable random string… to protect against CSRF". It is echoed back on `redirect_url?code=…&state=…` [M] |
| User can rename | GitHub shows an editable name field before creating the app [M] |
| Exchange | `POST https://api.github.com/app-manifests/{code}/conversions`, no auth. Returns **201** with the app object (`id`, `slug`, `node_id`, `client_id`, `owner`, `name`, `html_url`, `permissions`, `events`, …) plus `client_id`, `client_secret`, `webhook_secret` (string **or null**), `pem`. Errors are 404 and 422 ("validation failed, or the endpoint has been spammed"). Rate limited [REST apps]. |
| Expiry | "You must complete all three steps… within one hour" [M] |
| Name rules | ≤ **34 characters**. Must be **unique across GitHub** and cannot equal an existing account name unless it is your own. Displayed slugified (lowercase, spaces → `-`) [R] |
| Setup URL | Receives `installation_id` (and `setup_action`). "Bad actors can hit this URL with a spoofed installation_id… generate a user access token for the user who installed the GitHub App and then check that the installation is associated with that user" (via `GET /user/installations`) [S] |
| request_oauth_on_install | If enabled, the Setup URL cannot be used; users go to the Callback URL instead [R step 12] |
| Redirect on update | Redirects to the setup URL after repo add/remove; ignored if Setup URL is blank [R][S] |
| Update webhook later | `PATCH /app/hook/config` (app JWT) with `url`, `content_type`, `secret`, `insecure_ssl`. Also `GET /app/hook/config`, `GET /app/hook/deliveries`, and `POST /app/hook/deliveries/{id}/attempts` (redeliver) [REST app webhooks] |
| JWT | RS256. `iat` should be 60 s in the past (clock drift). `exp` no more than **10 min** ahead. `iss` = client ID (recommended) or app ID [JWT] |
| Installation token | `POST /app/installations/{id}/access_tokens` (JWT). Expires after **1 hour**. Can be scoped with `repositories`/`repository_ids` (≤500) and `permissions` [INST] |
| User token | Expires after **8 h** (`expires_in: 28800`). Refresh token `ghr_…` lasts **6 months** (`15897600`). Refresh with `grant_type=refresh_token`. Bad or expired refresh tokens return `bad_refresh_token` and need re-auth. PKCE `code_verifier` is "strongly recommended" [U][REF] |
| Default app events | `installation` (`created`, `deleted`, `new_permissions_accepted`, `suspend`, `unsuspend`) and `installation_repositories` (`added`, `removed`; `repositories_removed` is empty when switching all → selected) are always delivered. `github_app_authorization` (`revoked`) is also always delivered, and you must stop using that user's token [EV] |
| Signature | `X-Hub-Signature-256: sha256=<HMAC-SHA256 hex of raw body>`. Use constant-time compare [V] |
| Delivery semantics | Respond 2xx within **10 s**, otherwise the delivery fails. GitHub **does not auto-redeliver**. `X-GitHub-Delivery` is unique per event and **stays the same on redelivery**, so use it for idempotency/replay protection [BP][F] |

Sources:
- [M] https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
- [R] https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- [S] https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
- [REST apps] https://docs.github.com/en/rest/apps/apps#create-a-github-app-from-a-manifest
- [REST app webhooks] https://docs.github.com/en/rest/apps/webhooks
- [JWT] https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
- [INST] https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
- [U] https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- [REF] https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
- [EV] https://docs.github.com/en/webhooks/webhook-events-and-payloads
- [V] https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- [BP] https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
- [F] https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries

---

## 6. Lessons and pitfalls from Plane

1. **Config drift between env and DB** (#8100; dev-docs L332-339): copying credentials into a DB/Redis cache made env edits silently ineffective and needed a management command. Use one source of truth.
2. **Token expiry outage** (dev-docs L341-345): the integration "suddenly stopped working after a while" when user tokens expired, because there was no refresh logic. Manifest-created apps *will* have expiring tokens, so refresh support is mandatory for Envision.
3. **Callback mismatch or private app** (dev-docs L321-326): "Invalid request callback URL" came from a wrong callback or a non-public app when installing on another account.
4. **Base64 PEM in env** caused "Invalid keyData" errors (dev-docs L300-313). Storing the PEM from the manifest response directly avoids this.
5. **Path-prefix routing**: all endpoints sit behind `/silo/`, and every ingress (nginx/traefik/openshift/Caddy) must route that prefix.
6. **Duplicate bot comments** (#9117, #9227): an idempotency gap on PR events. Dedupe on delivery id and make "link comment" upserts idempotent (find the existing bot comment by marker and edit it).
7. **Lossy two-way content sync** (#9077, #9071, #9073): converting markdown ↔ rich text on round-trips overwrote human-authored GitHub bodies. Mentions and images were mangled, and asset URLs required Plane auth.
8. **No public API for mappings** (#8906): repo↔project mappings were UI-only, which blocked infrastructure-as-code.
9. **Guessable state**: legacy CE used the workspace slug as `state` (`use-integration-popup.tsx` L26). Plane only recently enforced matching OAuth state (PR #10069).

---

## Recommendations for an Envision (Frappe) implementation

### A. App creation through the manifest flow, one per site
1. **Single DocType `GitHub App Settings`** to hold the credentials:
   - Fields: `app_id`, `slug`, `client_id`, `client_secret` (Password), `private_key` (Password/Long), `webhook_secret` (Password), `owner_login`, `owner_type`, `html_url`, `created_via_manifest`, `webhook_url`.
   - Frappe `Password` fields are encrypted with the site's `encryption_key`, so back that key up. Losing it orphans the app.
   - Use this DocType as the only source of truth. Never copy the values into env or cache with a long TTL (pitfall 1).
2. **Start endpoint** (System Manager only):
   - Generate `state = secrets.token_urlsafe(32)` and store it in `frappe.cache` with a TTL of 3600 s, bound to the user and site.
   - Render an auto-submitting HTML form that POSTs `manifest=<json>` to `https://github.com/settings/apps/new?state=…`, or to `/organizations/<org>/settings/apps/new?state=…` when the admin enters an org login.
   - Recommend **org ownership** so the app survives staff turnover.
3. **Suggested manifest:**
   - `name`: `"Envision <site-short>"`, ≤34 characters. Generate it uniquely, e.g. a hash suffix. GitHub lets the user edit the name, and conversion fails on a collision, so show a clear retry message.
   - `url`: the site URL.
   - `hook_attributes`: `{url: https://<site>/api/method/envision.github.webhook, active: true}`.
   - `redirect_url`: `https://<site>/api/method/envision.github.manifest_callback`.
   - `callback_urls`: `[https://<site>/api/method/envision.github.oauth_callback]`.
   - `setup_url`: `https://<site>/api/method/envision.github.setup_callback`.
   - `setup_on_update: true`. Repo add/remove redirects back to the site.
   - `request_oauth_on_install: false`. Keeping it off is required because `true` disables the setup URL. Do the user OAuth separately.
   - `public`: `true` if the app may be installed on accounts other than the owner (Plane's pitfall 3). Otherwise `false`, with a clear note that it can only be installed on the owning account.
   - `default_permissions`: `{issues: write, pull_requests: write, metadata: read, members: read?}`. Add `contents: read` only if you need commit or branch lookups beyond the `push` payloads. Skip Plane's account "Profile: write".
   - `default_events`: `["issues","issue_comment","pull_request","pull_request_review","pull_request_review_thread","push","installation_target","sub_issues"]`. Add `meta` if you want a notification when the hook is deleted.
4. **Manifest callback:**
   - Pop and compare `state` (one-time use).
   - `POST /app-manifests/{code}/conversions` within an hour.
   - Persist `id`, `slug`, `client_id`, `client_secret`, `pem`, `webhook_secret`. If `webhook_secret` is null, generate one and `PATCH /app/hook/config`.
   - Redirect to `https://github.com/apps/<slug>/installations/new?state=<new state>`.
5. **Site URL changes** (domain rename, reverse-proxy path change): call `PATCH /app/hook/config` with the app JWT and show the admin which callback/setup URLs to update by hand. The REST API can't update those. **[could not find an API for callback/setup URL updates; I believe none exists]**

### B. Installation linking (avoid the spoofed `installation_id` risk)
- On the setup callback, ignore the trust value of `installation_id`. Immediately run the **user OAuth web flow** with `state` and PKCE, then call `GET /user/installations` and accept the installation only if it appears in that list.
- Then call `GET /app/installations/{id}` with the JWT and store an `GitHub Installation` record: `installation_id` (unique), `account_login`, `account_id`, `account_type`, `repository_selection`, `suspended_at`, `permissions` JSON.
- Since there is one app per site, multiple installations (e.g. several orgs) are fine. Keep them as child records.

### C. Tokens
- **JWT**: PyJWT RS256, `iat = now - 60`, `exp = now + 540`, `iss = client_id`.
- **Installation token**: cache in `frappe.cache` per installation until `expires_at - 5 min`. On 401, invalidate and retry once.
- **User tokens**:
  - Store `access_token`, `refresh_token` and both expiries in a per-user DocType with Password fields.
  - Refresh proactively. On `bad_refresh_token`, mark the user as disconnected and fall back to bot attribution.
  - Do **not** depend on non-expiring tokens the way Plane does (pitfall 2).
  - On `github_app_authorization: revoked`, delete that user's tokens.

### D. Webhook endpoint (`allow_guest=True` whitelisted method)
- Read the raw body with `frappe.request.get_data()` **before** any parsing. Verify `X-Hub-Signature-256` with `hmac.compare_digest`, then reject with 401 on mismatch.
- Insert a `GitHub Webhook Delivery` row keyed by `X-GitHub-Delivery` with a unique index. On a duplicate, return 200 and do nothing. Store `event`, `action`, `installation_id`, status and attempts.
- `frappe.enqueue(..., queue="short", enqueue_after_commit=True)` and return 202 well within 10 s.
- Use Frappe's RQ retries. Add a scheduler job every 10-15 min that lists `GET /app/hook/deliveries`, finds failures that are not in the table, and redelivers them with `POST …/attempts`. GitHub never retries by itself.
- Lifecycle:
  - `installation.deleted`: delete or disable the installation and its mappings.
  - `suspend` / `unsuspend`: toggle the installation flag.
  - `new_permissions_accepted`: refresh the stored permissions.
  - `installation_repositories.added/removed`: upsert or disable the repo rows. Handle the empty `repositories_removed` case when selection switches to "selected".
  - `installation_target`: update `account_login`.

### E. Features
- **Mapping:** `GitHub Repository` (repo_id unique, full_name, installation link) and `Repository ↔ Project` mapping. Make these normal DocTypes so the REST API covers them (pitfall 8).
- **PR linking:** follow Plane's split.
  - `[KEY-123]` in the title or body means link plus state automation; bare `KEY-123` means link only. Optionally also parse the branch name.
  - Store a `PR Link` child (pr id, number, url, state, merged, draft) for each Envision task.
  - Configure the state map per project: `draft`, `opened`, `review_requested`, `approved/ready`, `merged`, `closed`.
- **Bot comments:** upsert a single comment carrying a hidden marker (`<!-- envision:link -->`). Edit it instead of posting again (pitfalls 6 and 9227).
- **Two-way issue sync**, if built:
  - Gate it on an opt-in label (like Plane).
  - Keep `external_id` and a `last_synced_hash` per field.
  - Skip inbound events whose `sender.login == "<slug>[bot]"` or that match the last outbound hash.
  - Debounce outbound pushes.
  - Never overwrite a remote body when the content hasn't changed semantically, and prefer syncing descriptions one way at first (pitfall 7).

### F. Operational
- Document the URL paths. Frappe serves `/api/method/...`, which reverse proxies rarely rewrite, unlike Plane's `/silo/` prefix.
- Give the settings page a "Test webhook" button that reads `GET /app/hook/deliveries` and a health view showing the last delivery and its signature result.
- Provide a manual fallback form (paste App ID, PEM, etc.) for GHES/GHE.com or for air-gapped admins who can't do the manifest POST. This mirrors Plane's GHE form.

### Could not verify
- Silo source: webhook verification code, `X-GitHub-Delivery` handling, queue/retry semantics, state validation, how installation ids are verified, and the exact PR event → lifecycle mapping. The source is proprietary; I relied only on docs, Helm and issues.
- Whether Plane parses work-item ids from branch names.
- Whether `webhook_secret` is ever null in practice when `hook_attributes` is supplied. The schema allows null; I assume it is non-null when a hook URL is given.
- Whether any API updates callback/setup URLs after creation. I don't believe one exists for GitHub Apps; only the hook config is patchable.
