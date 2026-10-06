# Envision Link and Envision Link Type DocTypes for a Project's Links

A Link is a web address the team keeps with a Project, such as its docs, a dashboard or a design file, shown as a door on the Project's Links board. Each Link has a Type, such as Docs or Observability, which decides the icon on its card. ERPNext has no record for either.

- Frappe's link records, such as Dynamic Link and Workspace Link, point at other records, not web addresses.
- A URL attached to the Project as a File has no name, type or description, and sits among uploaded files.
- A Select field of fixed types would not let people add their own.

Envision therefore owns two more DocTypes in its Envision module:

- **Envision Link**: `link_name`, `project` (Link to Project), `link_type` (Link to Envision Link Type), `url`, `host` (read-only) and `description` (Text Editor: HTML from Envision's rich text editor, as on Modules and Tasks). It tracks changes, so Desk's timeline and Envision's Activity section show edits.
- **Envision Link Type**: `type_name`, `icon` (one of a fixed list of icon names, shared with the frontend) and `is_standard`. It is named after its type name.

A Type is its own record rather than text on each Link, so a Type made once is offered everywhere, and its icon is set in one place. The "Envision" prefix keeps both from reading as Frappe's own records, as with Envision Module (ADR 0002).

## Consequences

- Link Types are workspace-wide. One made from the link form in any Project is offered in every Project.
- Envision ships seven Types: Docs, Video, Observability, Chat, Design, Code and Link. They are created on install and on every migrate when missing, so a deleted one comes back. One that exists is left alone.
- A Type's name is unique across the workspace, case-insensitively, and cannot change once saved. The DocType's `validate` and `set_only_once` enforce this. Renaming is not supported yet.
- A Type still used by any Link cannot be deleted, because Links in other Projects would lose their Type. The DocType's `on_trash` refuses with a count of those Links. Frappe's linked-record check would refuse too, but it names only one Link.
- A Link's address must be `http://` or `https://`. The DocType's `validate` trims it, refuses anything else and stores its lowercase host in `host`, so Desk and the REST API obey the rule too.
- Envision never fetches a Link's address: no favicon, preview or title lookup. Fetching would tell the linked site, and anyone watching, who opened which Project, and could reach internal addresses from the server.
- The ⌘K search indexes a Link's name, description, Type name and host, never the full address, because a path or query string can hold a token or a private identifier.
- Access mirrors Modules (ADR 0002):
  - Projects User may create, read, write and delete Links and Link Types.
  - Projects Manager and System Manager hold every permission.
  - Adding a Link, or moving one to another Project, also needs read access to that Project.
- Deleting a Project that is allowed to go (no Tasks) also deletes its Links. The Project's `on_trash` guard does this, as it does for Modules. Link Types stay, since they belong to every Project.
- Links have no manual order. The board shows them oldest first, so a new door joins the end.
- Uninstalling Envision removes Envision Link and Envision Link Type records with their DocTypes. Projects and Tasks are untouched.
