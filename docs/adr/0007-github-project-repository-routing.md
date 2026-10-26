# Envision GitHub Project Settings routes one Project to one repository

> Superseded in part by ADR 0008: `sync_enabled` can now be turned on, only through the explicit activation with privacy and publication acknowledgements. Clearing a route, global disconnect and Project merges now also account for Issue links (paused and kept, or refused), and Project deletion removes its tombstones.

Issue sync (docs/plans/github-issue-sync.md) needs to know which Project a repository's Issues belong to, and which repository a Project's Tasks publish to. ERPNext's Project has no field for an external repository, and the connection records of ADR 0006 describe what the site's GitHub App can access, not where Issues go. Envision therefore owns one routing DocType, **Envision GitHub Project Settings**, in its Envision module.

This ADR records stage 1 of the plan: the routing foundation, built ahead of sync and shipped without UI. The product decision is to wait for working sync before showing any repository controls, so this stage adds no frontend mapping controls and no whitelisted mapping endpoints.

## The record

- `project` (Link to Project) and `repository` (Link to Envision GitHub Repository, whose name is GitHub's stable repository ID). Both are required, **unique**, and **set once**. The unique indexes make the route one-to-one even when two writers race; the controller's own checks give the friendly message first.
- `sync_enabled` (Check), always 0 in this stage. The controller refuses a route that sets it, from any caller.
- `connected_by` and `connected_on`, set by the controller on insert whatever a caller sent, then fixed.
- Named by hash, not after its Project. Envision Projects can be renamed (setu/hooks.py has Project `after_rename` hooks). Frappe updates Link values on rename, so the route follows the Project, while a record named after the Project would keep the old name.

## Rules (setu/github/projects.py, called from the controller)

- **Who.** Changing a route needs System Manager or Projects Manager **and** write access to that Project. Generic DocType access is read-only: the JSON grants System Manager read (Frappe gives a DocType with no permission rows full System Manager access, so it cannot simply be empty), the `has_permission` hook denies every other permission type and requires read access to the route's Project, and `permission_query_conditions` scopes lists and reports to readable Projects. Only Administrator, who bypasses permissions, can write the record through Desk or REST, and the controller applies the same checks to those writes. Removing a route checks the same in `on_trash`.
- **New routes must be usable now.** This site's app is connected and its address is current. The Project is Envision-enabled. The repository is listed by the app, available, not archived, and has Issues turned on. Its installation is not removed or suspended and belongs to the app's owner account.
- **No silent remapping.** A Project or repository already routed is refused. A route's project and repository never change; changing a route means clearing it and connecting again. There is no Task-level or per-request override: routing is only ever looked up from this record.
- **Losing access never removes a route.** Repository removal from the installation, suspension, uninstall, archival, Issues turned off, an Envision-disabled Project, or a changed site address all leave the route in place. The projection reports `routable: false` and the first `inactive_reason`. A future sync must also require `sync_enabled`, so a routable route still moves no data.

## Visibility

`get_project_route` is for anyone who can read the Project. It returns the repository's name, URL, visibility, archival, availability and Issues state, the route state, and whether this user could change it. It never returns installation, app or attribution details. This follows the decision that Project readers may see repository metadata once the UI ships; since access is role-wide in the first version (CONTEXT.md), that means every reader of the Project, including private repositories' names.

`list_repository_candidates` is for managers with write access to the Project. It leaves out repositories already routed to any Project, so it never reveals which other Project uses one.

## Concurrency and lifecycle

- Route inserts lock the Project row, then the repository row, inside the inserting transaction.
- Project deletion's `on_trash` guard (`guard_project_delete`) locks the Project row and deletes its route. It runs before Frappe's link check, so the route never blocks the delete, and a concurrent insert cannot slip a route in between.
- Global disconnect (ADR 0006) locks every repository row, deletes all routes, then deletes repositories and installations. Its confirmation states how many Project connections it removes.
- `connect_repository` and `clear_repository` also take the shared connection lock (`connection.connection_lock`) and commit before releasing it, so the next holder of the lock sees the committed state. Each runs its own transaction: call them only at a request boundary. The controller itself never commits.
- The Project `before_rename` guard refuses a merge if either Project has a route. Frappe rewrites Link fields without controller validation during a merge, so even merging into an unrouted Project must be refused to prevent silently moving routing. Ordinary renames remain allowed.

## Consequences

- Nothing in this stage calls GitHub for routing, receives Issues, creates Tasks or publishes Tasks. Issue webhooks stay Ignored (ADR 0006). Inbound and outbound sync, the privacy acknowledgement, and the point where existing `github`-labelled Issues import remain pending, as do the plan's other proposed policies.
- Routes can only be created through the internal API or by Administrator. Without UI, a route created this way is a foundation for the next stage, not a working integration.
- Uninstalling Envision removes routes with their DocType. Projects, Tasks and repositories are untouched.
- Real GitHub validation of the connection and of routing is still pending.
