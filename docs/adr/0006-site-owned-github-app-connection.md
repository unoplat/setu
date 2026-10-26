# A site-owned GitHub App for Envision Issue sync

> Superseded in part by ADR 0008. Issue and sub-issue events are now received for routed repositories, still storing identifiers only. The manifest subscribes to `issues` and `sub_issues`. Disconnect pauses and keeps Issue links. The connection is also bound to its site and database, so a restored copy stops syncing until confirmed.

Each Envision site owns a private GitHub App, created through GitHub's manifest registration flow and installed on its owner organization or personal account. GitHub calls the site's own HTTPS endpoints; no Unoplat relay or shared credential store is introduced. One Project will connect to one repository when the mapping milestone is implemented.

Standard ERPNext Project and Task records remain authoritative (ADR 0001). Frappe identity, sessions, and System Manager permissions govern connection administration. Frappe's Social Login Key configures user login/OAuth, not a site-owned GitHub App with installation credentials and webhook identity.

## Connection records

Envision therefore owns four connection DocTypes in its Envision module:

- **Envision GitHub Settings**, a Single: app ID/slug, client identity, owner identity, registered site URL, connection attribution, and encrypted Password fields for the private key, webhook secret, and returned client secret. No change tracking records secrets in Version history.
- **Envision GitHub Installation**, named by GitHub installation ID: account identity, repository selection, suspension/removal state, granted permissions, and last refresh time.
- **Envision GitHub Repository**, named by stable GitHub repository ID: installation, current name/URL, visibility, availability, archival, and Issues capability. This is an access catalog, not yet a Project mapping.
- **Envision GitHub Delivery**, named by `X-GitHub-Delivery`: authenticated receipt metadata, lifecycle processing state, attempts, and a safe error. A generic request log alone does not supply this unique receipt identity and recoverable processing lifecycle. This milestone stores no raw payload or Issue content.

DocType permissions grant only System Managers read access and grant no regular write access; Frappe's Administrator retains its normal permission bypass. Permission-checked connection endpoints and trusted background processing perform mutations. Envision's endpoints return an explicit safe projection without credentials. System Managers remain trusted administrators: Frappe's core password-reading endpoint can decrypt Password fields, so this design does not conceal secrets from them.

## Consequences

- GitHub App permissions are Metadata read and Issues write, with `issues` subscriptions. Installation events are delivered automatically by GitHub. User OAuth, PR access, Contents access, and GitHub Projects are not requested.
- The manifest form is submitted by the browser to GitHub. A random, expiring, one-time state is bound to the initiating Frappe user, purpose, and configured public site URL. Installation state is also bound to the app ID. Manifest state is consumed only after acquiring the connection lock; a transport failure before receiving a GitHub response restores it only for its original remaining lifetime, allowing a safe retry if GitHub has not consumed the code.
- The public URL comes from the site's explicit HTTPS `host_name`, not an untrusted incoming Host header. Callbacks and webhook paths in `setu/api/github.py` are a persistent external contract.
- A private app is limited to its owner account. Installation identity is verified with an app JWT and compared with the saved app and owner IDs. The browser callback's state-less setup update may only refresh an already-known installation, not attach a new one. State-less install/approval-request callbacks show Pending without trusting the supplied installation ID; independently verified lifecycle webhooks or an admin Refresh reconcile the installation.
- Frappe does not auto-commit GET callbacks, so successful credential storage and installation callbacks explicitly commit. Registration secrets returned once by GitHub are retained even if the subsequent installation redirect fails.
- The app JWT signs short-lived installation tokens. githubkit mints both and keeps them in each process's memory (its `MemCacheStrategy`), never in Redis; they are refreshed on expiration or once on a 401. Requests never retry automatically or follow redirects. Errors never include GitHub response bodies, authorization headers, private keys, or registration codes.
- Webhook HMAC-SHA256 verification requires a lowercase SHA-256 signature before githubkit verifies the raw request bytes with constant-time comparison. Receipts are uniquely named; duplicate receipt insertion is safely acknowledged. Explicit redelivery of a Failed receipt requeues it with a fresh retry budget; Queued, Processing, and completed receipts are not reset. Unexpected worker errors log only stack locations and exception type, not exception messages or local variable values. Lifecycle work is queued only after commit, with scheduled recovery for queue outages, worker failures, and failed attempts.
- Installation/repository updates read canonical GitHub state instead of replaying stale payloads. Paginated discovery completes before removing access locally. Suspension/removal disables access without silently deleting remote work.
- The connection milestone records GitHub pings and refreshes installation/repository lifecycle. Issue events are explicitly marked Ignored: receiving an event does not mean Issue synchronization is implemented.
- A changed site URL blocks normal connection mutations. The admin must manually update the GitHub setup URL, then confirm the new address; Envision updates the webhook URL through GitHub's interface. The manifest registration redirect is used only during app creation; no persistent user OAuth callback is configured in this milestone. Restored clones must not rebind unless intentionally taking over the integration.
- Disconnect uninstalls known installations before clearing credentials. Remote failure preserves local credentials for retry. It does not delete repositories, Issues, or the app registration; the admin removes the registration on GitHub separately.
- Receipt metadata is retained for 30 days. Credential recovery depends on backing up the site's encryption key.

## Follow-up scope

Project/repository mapping, Task/Issue identity, publishing on the `github` tag, bidirectional title/description synchronization, and Open/Closed state mapping are subsequent milestones in `docs/plans/github-issue-sync.md`. None is implied by a Connected indicator. Full Task Status parity is out of scope because ordinary GitHub Issues only have Open and Closed states.
