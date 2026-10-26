# Connect a development Envision site to GitHub

This guide creates and installs a site-owned GitHub App, verifies repository access and signed webhooks, and turns on Issue sync for a Project (docs/adr/0008). Use a test repository: turning sync on copies Issues into Envision and tagged Tasks to GitHub.

## Prerequisites

- A development Envision site with the new app code deployed and `bench --site <site> migrate` completed.
- A public HTTPS address reaching the Frappe site (a full tunnel supports both webhooks and browser callbacks).
- A Frappe System Manager account.
- Permission to create a GitHub App under the intended organization/account and install it on a test repository. The private app installs only on its owner account.

## Local HTTPS configuration

A local HTTP Frappe server is sufficient behind an HTTPS tunnel. With the repository's Frappe Manager setup:

```bash
cd frontend
mise run tunnel
```

The tunnel task forwards to the local proxy with the correct Frappe Host header. Keep the tunnel running and configure the returned **base** address, without `/envision`:

```bash
fm shell erpdev.localhost -c \
  "bench --site erpdev.localhost set-config host_name https://<tunnel-host>"
```

Build/deploy and migrate from `frontend/` if necessary:

```bash
mise run deploy-local
mise run migrate
```

Open `https://<tunnel-host>/envision/settings` and log in there. A session on `localhost` is not a session on the tunnel domain. No global CSRF bypass, local TLS certificate, or personal access token is needed.

## Create and install

1. In Envision Settings → GitHub, choose Organization and enter its GitHub login (or choose a personal account).
2. Click **Create GitHub App**. The browser submits the preconfigured manifest to GitHub. Requested permissions are Issues read/write and Metadata read; no source-code access is requested.
3. Review the owner and app name on GitHub and create the app.
4. GitHub redirects back to Envision, which stores the generated credentials encrypted and opens the installation page.
5. Install on the owner account and choose **only a test repository** for this development app.
6. On return to Envision, confirm the app is Installed and the repository appears. **Refresh** reconciles installation and repository access if a callback or webhook arrived late.

Never paste the app's private key, client secret, webhook secret, or temporary registration code into chat or commit them to the repository. Envision does not return credentials to the frontend; trusted System Managers can still decrypt Password fields through Frappe's core administration interfaces.

## Verify delivery

In the GitHub App's webhook settings, send/redeliver a ping. Envision Settings shows the last verified webhook and its status. Pings are Processed and installation lifecycle events refresh in the background. Issue and sub-issue events depend on the repository's Project:

- **Queued:** its Project is syncing.
- **Deferred:** the Project's sync is off, paused or blocked. Resuming processes them.
- **Ignored:** no Project uses the repository.

Other notes:

- Missing/invalid signatures receive HTTP 401 and are not recorded as verified deliveries.
- Repeated successful delivery IDs are acknowledged without another record. Redelivering a Failed receipt explicitly requeues it and resets its retry budget; in-flight receipts are not reset.
- Installation changes and Issues are processed by the long worker, and Task sync by the default worker. The scheduler retries queued/failed receipts and sync work every five minutes, and does not poll GitHub for missed Issue or sub-issue webhooks. Keep the site's scheduler and workers running.
- Delivery logs store identifiers only (repository, Issue, parent, GitHub actor), never Issue bodies, app credentials or webhook payloads. Logs are System Manager-only and expire after 30 days.

### Apps created before Issue sync

Issue sync also needs the **Sub-issues** webhook event. New apps subscribe to it through the manifest. For an existing app:

1. Open the app's settings on GitHub (**Permissions & events**) and tick **Sub-issues**.
2. Click **Refresh** in Envision Settings. Settings warns while an event is missing.

Sub-issue changes made on GitHub arrive only through this event, so Issue sync can't be turned on for a project until it is subscribed.

## Turn on Issue sync for a project

A System Manager or Projects Manager with write access to the Project does this in the Project's Settings → GitHub section. Everyone who can read the Project sees that section's repository, its visibility and the sync state, but not its errors or the controls.

1. **Connect a repository.** Only repositories no other Project uses are offered. Sync stays off.
2. **Turn on sync…** The dialog shows:
   - the repository and whether it is public or private;
   - that its Issues, private ones included, become Tasks readable by everyone who can read this Project's Tasks;
   - that tagged Tasks' titles, descriptions and subtasks are copied to GitHub, and that `@mentions` and `#references` notify people and link Issues there;
   - any webhook events the app is missing;
   - the Tasks already tagged `github`, with a "Publish … now" box. Left unticked, they are held, and each can be published from its Task page.
   Turn on sync stays disabled until both acknowledgements are ticked. If the tagged Tasks changed since the dialog opened, Envision refuses, shows the current list, and clears the publish box.
3. **Existing Issues.** Issues already labelled `github` import in the background. The section shows the import's progress. Issues created from then on import whether labelled or not. Older unlabelled Issues and pull requests never import.
   - The import reads labels when it runs, usually right after you turn sync on. GitHub doesn't say when a label was added, so if the import is delayed or fails and you retry it, older Issues labelled in the meantime import too.
   - Don't add the label to older Issues until the import shows Done. After that it never runs again.

The section then offers **Pause sync** or **Resume sync**, **Retry failed** (when Tasks have errors or the import failed) and **Disconnect repository…**. Its confirmation says how many linked Tasks will pause.

After that:

- Adding `github` to a Task, at creation or later, publishes it and its subtasks. A Task links to one Issue, ever.
- Removing the tag does not stop sync. Pause or Disconnect the Task to stop it. A disconnected Task is never republished by its tag; Resume reconnects it to its original Issue.
- Deleting a Task never deletes its Issue, and deleting an Issue never deletes its Task. The link is kept so neither comes back as a copy.
- GitHub reopening a Done Task's Issue, closing an Issue as not planned or duplicate, and closing a Blocked Task's Issue show a conflict. Nothing changes until someone with write access chooses Keep Envision or Keep GitHub. Envision never reopens a Task by itself.
- A description that Markdown or Envision cannot show exactly also shows a conflict, with both versions kept.
- **Long Issue titles.** A Task title holds 140 characters by default; a GitHub title can be longer. A longer title is not a conflict, and Envision never shortens it on GitHub.
  - The Task's title takes the first characters.
  - A paragraph at the top of its description, **GitHub title continuation:** …, holds the rest. This happens on import and whenever the title changes on GitHub.
  - That paragraph is part of the title, not the description: it is never copied into the Issue's description, and a title change on GitHub rewrites or removes it.
  - The Issue title is the Task's title followed by that paragraph's text. Editing either one, or deleting the paragraph, changes the whole Issue title. If both sides changed the title differently, a conflict keeps both.
  - A whole title longer than GitHub's 256 characters shows an error until it is shortened. It is never cut to fit.
- **Issues already closed** when they import (completed, or with no reason) become Done Tasks through the normal Task rules. A refusal, such as an open subtask, shows as an error.
- Changes from GitHub are saved as the disabled user `envision-github@bot.invalid`, through the normal Task rules; the Task's Activity names the GitHub user. A refused change shows as an error.
- **Adding `github` in Envision asks first.** On the Task page or in Create Task, adding the tag in a syncing Project opens **Publish to GitHub?** before the tag is saved. It shows the repository, its visibility, the subtasks that go with it, and the mentions warning. Create Task also says when a new subtask will publish with its parent. Tags added in Desk or through REST publish without this prompt.
- **The Task page's GitHub block** (in the rail, above Activity) shows the state, the Issue link, when the Task last synced, pending work, errors and conflicts. It offers only the actions the server allows: Publish…, Retry, Pause, Resume and Disconnect….
- **Conflicts.** Opening a conflict shows both versions. GitHub's description is shown as Markdown text, never as HTML. Choose Keep Envision or Keep GitHub; the choice applies at the next sync.
- Pausing the Project defers webhooks until it resumes.
- If a create timed out, the Task shows that Envision is checking GitHub. Envision looks for the Issue before creating it again, even after a Disconnect and Resume. It only accepts an Issue opened by this site's app bot that carries the Task's marker.
- **Sub-issues created on GitHub** (with **Create sub-issue**) import under their parent's Task, once both have imported.

Sync is never turned on by an upgrade or by reconnecting. Pilot on a non-production repository before enabling customer Projects.

## Restored or copied sites

The connection is bound to its site and database name. A restored or copied site with a different name stops all Issue sync before contacting GitHub, and Settings asks a System Manager to confirm the site. Confirm only on the site that should own the integration from now on, after disconnecting or retiring the original, so two sites never write the same Issues.

## Common problems

- **Public URL configuration error:** set `host_name` to the HTTPS origin without a path, query, or fragment. Incoming tunnel Host headers are not used to create callback URLs.
- **Registration failed:** first check whether GitHub created the app. If Envision already shows it, choose **Install on GitHub** rather than creating another app. If registration completed on GitHub but credentials were not stored locally, remove the orphan app on GitHub before starting again.
- **Pending installation:** installs/approval requests started on GitHub may return without Envision's browser state. This does not attach an unverified ID; a verified webhook or **Refresh** discovers the completed installation. Wait for any required organization approval.
- **Installation failed:** return to Settings and try **Refresh**. Otherwise start **Install on GitHub** again from Envision to get fresh one-time state. Be logged in as the same System Manager on the public domain.
- **Suspended installation:** restore it on GitHub and refresh. Removed repositories disappear from the accessible list after lifecycle processing or refresh.
- **Tunnel address changed:** update `host_name`, then follow the address-change instructions in Settings. Manually update the app's post-installation Setup URL on GitHub, then confirm. The manifest registration redirect is only used at creation, and no user OAuth callback is needed in this milestone. Envision updates the webhook URL automatically. Do not point a restored clone at an app still used by the original site.
- **GitHub denied access:** check installation approval and Issues read/write permission; rate limits may require waiting before retrying. Envision does not log GitHub response bodies or secrets.

## Disconnect

**Disconnect GitHub** requires confirmation and uninstalls known connected installations before deleting local credentials and catalog records.

- It removes Project repository routes (the confirmation says how many).
- It pauses every synced Task's link (`app_disconnected`) and keeps it, so Tasks keep their Issue identity and tombstones.
- After reconnecting, turning sync on again for the same repository resumes those links after a fresh comparison.
- It never deletes repositories, Issues or Tasks.
- If remote uninstall fails, credentials remain for retry.

The GitHub App registration remains on GitHub; delete it there separately if no longer needed.

Disconnecting one Project's repository works the same way for that Project only: its links pause (`route_cleared`) and resume only if the same repository is connected again.

Back up the Frappe site's encryption key with its database. Losing the key prevents recovery of the stored app credentials.
