# Reuse ERPNext Project and Task records

Envision extends standard ERPNext Project and Task records rather than duplicating them in Envision-owned DocTypes. This preserves interoperability across the Envision Interface, Frappe Desk, native ERPNext forms, and APIs while keeping ERPNext’s Task status as the single source of truth. Envision adds app-managed fields and status options where necessary, represents Milestones with standard ERPNext milestone Tasks, uses native site-wide Tags, and owns only behavior or records for which ERPNext has no compatible representation, such as Project membership semantics, private Custom Views, Milestone associations, Modules (ADR 0002) and ordering. Task deletion is immediate and permanent; Envision does not maintain archive metadata or a recovery window (CONTEXT.md, Deleted Task).

## Consequences

Envision must enforce its permissions and lifecycle invariants through every ERPNext access path, not only through its React interface. Uninstalling Envision preserves standard Projects, Tasks, Users, and Tags; Blocked Tasks are converted to Open before Envision-owned records, metadata, and customizations are removed.
