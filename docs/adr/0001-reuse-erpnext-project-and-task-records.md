# Reuse ERPNext Project and Task records

Setu extends standard ERPNext Project and Task records rather than duplicating them in Setu-owned DocTypes. This preserves interoperability across the Setu Interface, Frappe Desk, native ERPNext forms, and APIs while keeping ERPNext’s Task status as the single source of truth. Setu adds app-managed fields and status options where necessary, represents Milestones with standard ERPNext milestone Tasks, uses native site-wide Tags, and owns only behavior or records for which ERPNext has no compatible representation, such as Project membership semantics, private Custom Views, Milestone associations, ordering, and archive metadata.

## Consequences

Setu must enforce its permissions and lifecycle invariants through every ERPNext access path, not only through its React interface. Uninstalling Setu preserves standard Projects, Tasks, Users, and Tags; Blocked Tasks are converted to Open before Setu-owned records, metadata, and customizations are removed.
