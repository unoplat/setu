# Envision Module DocType for a Project's Modules

A Module is a lasting part of a Project's product, such as Payments or Onboarding, with an optional Lead and a rich-text description, and no status or dates. ERPNext has no record for this.

- A Task Type classifies a kind of work across every Project, not an area of one Project's product.
- Is Group and Parent Task already represent Subtasks.
- Frappe's Module Def is an app's code module, a different concept.

Envision therefore owns one DocType, **Envision Module**, in its Envision module. Its fields are `module_name`, `project` (Link to Project, set once), `lead` (Link to User) and `description` (Text Editor). It tracks changes, so Desk's timeline and Envision's Activity section show edits. The "Envision" prefix keeps it from reading as Module Def.

## Consequences

- A Module's name is unique within its Project, case-insensitively. The DocType's `validate` enforces this, so Desk and the REST API obey the rule too.
- Access follows ERPNext roles, as the first version's Release Scope requires:
  - Projects User may create, read, write and delete Modules.
  - Projects Manager and System Manager hold every permission.
- Deleting a Project that is allowed to go (no Tasks) also deletes its Modules. The Project's `on_trash` guard does this, because Frappe runs `on_trash` before its linked-record check.
- Filing Tasks under a Module is decided (a Link field on Task, so at most one Module per Task) but not yet built. It will arrive with the Tasks board.
- Uninstalling Envision removes Envision Module records with the DocType. Projects and Tasks are untouched.
