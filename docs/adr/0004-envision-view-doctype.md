# Envision View DocType for Custom Views

A Custom View is one person's saved set of Task filters for a Project's Board, or for My tasks, opened again in one click. It is private to its creator. ERPNext has no record for this.

- ERPNext's Kanban Board record is shared by everyone who can see it, and it describes columns, not filters.
- Frappe's saved list filters and list settings belong to Desk's list view, not to Envision's Board.
- Keeping views only in the browser would lose them on another device.

Envision therefore owns a second DocType, **Envision View**, in its Envision module. Its fields are `view_name`, `project` (Link to Project) and `filters` (JSON). The "Envision" prefix keeps it from reading as one of Frappe's own views, as with Envision Module (ADR 0002).

A view with a `project` belongs to that Project's Board. A view with no `project` is a **My tasks view**. There is no separate scope field: an empty `project` is the only marker, and every view made before My tasks views existed has a Project, so no data needed changing.

`filters` holds, for each of `milestone`, `priority`, `assignee`, `tag` and `project`, the values a Task may have. A Task passes when it matches any value of every field that has some. Fields with nothing chosen are left out.

- Only a My tasks view may filter by `project`. A Project's Board already shows one Project.
- A My tasks view never filters by `assignee`. My tasks always shows the signed-in user's own Tasks, and that cannot be changed.
- Each `project` a My tasks view filters by must be an Envision-enabled Project when the view is saved.

## Consequences

- A view is its creator's alone. The DocType's `has_permission` hook refuses everyone but the owner, and its `permission_query_conditions` hook limits lists to one's own, so Desk and the REST API are private too. Only Frappe's built-in Administrator, who bypasses every permission, can see other people's views.
- Role permissions only decide who may keep views at all: Projects User, Projects Manager and System Manager. Creating a Project's view also needs read access to that Project. Creating a My tasks view needs read access to Tasks.
- A view's name is unique for its owner within a Project, and separately among that owner's My tasks views, case-insensitively. The DocType's `validate` enforces this. Two people may each have an "Urgent" on the same Project, and one person may have an "Urgent" on a Project and another on My tasks.
- A view stays where it was made. Saving it never moves it between a Project and My tasks.
- A view does not save card order. The Board orders Tasks by last change for everyone, so a view only filters it. Moving a Card in a view changes that Task for everyone, as on All tasks.
- A view may name a Milestone, a Tag or a person that no longer exists. It still opens, with its other filters applied.
- Renaming keeps views working. Frappe's rename moves a view's `project` and `owner`, which are Link fields, but not the names inside `filters`. Envision's `after_rename` hooks replace the old name in `filters` when a Project, User or Tag is renamed or merged. A merge leaves the surviving name once. Milestones are Tasks, which cannot be renamed, so they need nothing.
- There is no sharing in the first version, and no "Duplicate view".
- Deleting a Project also deletes everyone's views of it. The Project's `on_trash` guard does this, as it does for Modules. The guard also removes the Project from every My tasks view's `project` filter, and deletes a My tasks view that filtered by that Project alone, since an empty filter would show every Project instead.
- Uninstalling Envision removes Envision View records with the DocType. Projects and Tasks are untouched.
