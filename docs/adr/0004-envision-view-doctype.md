# Envision View DocType for a Project's Custom Views

A Custom View is one person's saved set of Task filters for a Project's Board, opened again in one click. It is private to its creator. ERPNext has no record for this.

- ERPNext's Kanban Board record is shared by everyone who can see it, and it describes columns, not filters.
- Frappe's saved list filters and list settings belong to Desk's list view, not to Envision's Board.
- Keeping views only in the browser would lose them on another device.

Envision therefore owns a second DocType, **Envision View**, in its Envision module. Its fields are `view_name`, `project` (Link to Project) and `filters` (JSON). The "Envision" prefix keeps it from reading as one of Frappe's own views, as with Envision Module (ADR 0002).

`filters` holds, for each of `milestone`, `priority`, `assignee` and `tag`, the values a Task may have. A Task passes when it matches any value of every field that has some. Fields with nothing chosen are left out.

## Consequences

- A view is its creator's alone. The DocType's `has_permission` hook refuses everyone but the owner, and its `permission_query_conditions` hook limits lists to one's own, so Desk and the REST API are private too. Only Frappe's built-in Administrator, who bypasses every permission, can see other people's views.
- Role permissions only decide who may keep views at all: Projects User, Projects Manager and System Manager. Creating one also needs read access to its Project.
- A view's name is unique for its owner within a Project, case-insensitively. The DocType's `validate` enforces this. Two people may each have an "Urgent" on the same Project.
- A view does not save card order. The Board orders Tasks by last change for everyone, so a view only filters it. Moving a Card in a view changes that Task for everyone, as on All tasks.
- A view may name a Milestone, a Tag or a person that no longer exists. It still opens, with its other filters applied.
- There is no sharing in the first version.
- Deleting a Project also deletes everyone's views of it. The Project's `on_trash` guard does this, as it does for Modules.
- Uninstalling Envision removes Envision View records with the DocType. Projects and Tasks are untouched.
