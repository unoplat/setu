# Envision Project Work

Envision is an ERPNext marketplace app that presents ERPNext project records through a focused SaaS project-management interface.

Standard DocType and field references in this document must follow the official ERPNext or Frappe documentation listed below. A label in the Envision Interface or Paper design does not establish a DocType. Envision-owned records must be named explicitly and justified by a documented gap.

## Release Scope

**First version**:
Envision has no access model of its own. Every Frappe User whose ERPNext role permissions allow it can see and edit every Envision-enabled Project, and Task actions follow ERPNext's standard permissions: editing requires write permission and deletion requires delete permission. Envision does not invite people to a Project, does not define Envision roles, and does not add permission rules to Project or Task.

**Next version**:
Project membership, invitations, and the roles defined under Membership below (Envision Administrator, Project Admin, Project Member, Project Viewer), together with every rule that depends on them: Project-level visibility, restricting assignees to Project Members, and role-dependent controls. Those terms stay in this document so the language is settled, but nothing in the first version may depend on them.

## Work Structure

**Project**:
The standard ERPNext Project record. When enabled for Envision, it becomes Envision’s top-level collaboration boundary and contains one Kanban Board, Milestones, and its Custom Views. In the first version access follows ERPNext’s standard Project role permissions; the Project becomes an access boundary with members in the next version.
_Avoid_: Envision Project, Workspace, standalone board

**Envision-enabled Project**:
A standard ERPNext Project explicitly opted into Envision’s workflow and interface. Projects created through Envision are enabled automatically; disabling Envision hides the Project from the Envision Interface without deleting its data.
_Avoid_: Envision Project, imported project

**Kanban Board**:
A Project’s primary operating view, where ERPNext Task records are organized by Status. ERPNext documents status-based Task Kanban views and Status updates through card movement; Envision adds its Project layout, ordering, filters, and private Custom Views.
_Avoid_: Project board, task board, standalone Board DocType

**Task**:
The standard ERPNext Task record presented by Envision as a unit of project work; it appears as a Card on the Kanban Board and may contain linked Subtasks.
_Avoid_: Envision Task, Issue, ticket, work item

**Task ID**:
The standard identifier assigned to a Task by ERPNext, such as `TASK-2026-00001`; Envision does not maintain a separate Project-specific identifier or sequence.
_Avoid_: Envision Task ID, Project Key, issue key

**Card**:
The visual representation of a Task on the Kanban Board.
_Avoid_: Using card for the underlying Task

**Subtask**:
A full Task linked beneath a parent Task to represent a smaller part of its work; it may contain Subtasks of its own.
_Avoid_: Checklist item, child issue

## Classification and Planning

**Status**:
A Task’s single workflow position. Envision presents ERPNext’s Open, Working, Pending Review, Overdue, and Completed statuses as Todo, In Progress, Review, Overdue, and Done, and adds Blocked. Envision does not support ERPNext’s Cancelled status; Cancelled Tasks are hidden from the Board.
_Avoid_: State, Envision Status, priority

**Priority**:
A Task’s urgency level: Low, Medium, High, or Urgent.
_Avoid_: Severity, rank

**Assignee**:
A Frappe User assigned to an ERPNext Task through Frappe's Assign To mechanism. Frappe represents an assignment with a ToDo linked to the Task and updates the Task's assignment metadata. Envision does not add an Assignee DocType. In the first version any Frappe User that ERPNext allows can be assigned; restricting eligible assignees to Project Members belongs to the next version.
_Avoid_: Owner, custom Assignee record

**Milestone**:
A standard ERPNext Task designated as a milestone and treated by Envision as a Project target rather than ordinary Board work. Its completion is derived when it has at least one associated Task and every such Task is Done. Tasks cancelled in ERPNext are ignored.
_Avoid_: Custom Envision Milestone, Sprint, iteration, release

**Start Date**:
The calendar date on which a Task is expected to start. Envision presents ERPNext Task's Expected Start Date as Start Date without exposing a time.
_Avoid_: Actual Start Date, creation date

**Due Date**:
The calendar date by which a Task is expected to be completed. Envision presents ERPNext Task's Expected End Date as Due Date without exposing a time.
_Avoid_: Actual End Date, deadline, due time

**Tag**:
A Frappe document tag attached to a Task and used for filtering and grouping. Frappe documents tags through the Document API; Envision does not treat a Paper tag label as evidence for a separate Project Tag DocType.
_Avoid_: Project Tag, Label, category

**Custom View**:
An Envision-owned, private, reusable Kanban configuration that preserves structured Task filters for its creator. A Custom View belongs either to one Project's Kanban Board or to My tasks. A My tasks view may also filter by Project, and never by Assignee, because My tasks always shows the creator's own Tasks. It does not preserve Board ordering in the first version. ERPNext provides Task Kanban views, but the documented standard view does not establish Envision's private saved configuration semantics.
_Avoid_: Shared view, saved search, filter preset, ERPNext Kanban Board DocType

## Navigation, Personal Work, and Communication

**Home**:
The global Envision landing area shown in the Paper navigation. Its content and underlying records are not yet specified.
_Avoid_: Frappe Desk Home, Project Home DocType

**My tasks**:
A personal, cross-Project view of ERPNext Task records assigned to the signed-in user, across every Envision-enabled Project. Assignment comes from Frappe's ToDo-backed Assign To mechanism rather than the Task's assignment metadata, so a Done Task stays on My tasks after ERPNext closes its assignments. My tasks is a view, not a DocType, and has its own private Custom Views.
_Avoid_: Project Todos, Todo Status, standalone personal Task

**Inbox**:
A personal stream of unread Project activity and system notifications that may need the signed-in user's attention. Frappe's Notification DocType configures triggers and delivery, including System Notification, but the Paper label does not establish the storage model for every Inbox item.
_Avoid_: Notification DocType, activity log, email inbox

**Project Todos**:
The Project-scoped Todos section shown in the Paper navigation. Its behavior and record basis are still undecided. Do not equate it with My tasks, the Todo Board Status, or Frappe's ToDo DocType without a product and architecture decision.
_Avoid_: My tasks, Todo Status, assumed ToDo mapping

**Module**:
A lasting part of a Project's product, such as Payments or Onboarding, stored as an Envision Module record (ADR 0002). It belongs to one Project and has a name that is unique within that Project, an optional Lead, and an optional rich-text description. It has no status and no dates. Filing Tasks under a Module, at most one Module per Task, is decided but not yet built. The Project-scoped Modules section lists a Project's Modules.
_Avoid_: Frappe Module Def, Task Type, component, epic

**Lead**:
The Frappe User the team goes to about a Module. A Module has at most one Lead, stored on the Module itself rather than through Frappe's Assign To, because leading an area is not a piece of work to complete.
_Avoid_: Owner, Module assignee

**Message Board**:
A Project-scoped space for durable asynchronous discussions and announcements available to everyone who can access that Project. Its backing DocType is not established by the Paper design.
_Avoid_: Chat, comments feed, direct messages, assumed Communication mapping

**Settings**:
The Envision Interface area for global application configuration and Project-scoped configuration. In the first version the options shown depend only on ERPNext role permissions; options that depend on an Envision role or Project membership belong to the next version.
_Avoid_: Envision Desk Workspace, system console

## Membership (next version)

Not part of the first version. These roles are defined so the language is ready, but the first version ships no membership, invitations, Envision roles, or Envision permission rules; see Release Scope.

**Envision Administrator**:
A global Envision role assigned through Frappe’s standard User management, with authority across Envision-enabled Projects. Frappe’s built-in Administrator has implicit access; Envision does not create or manage Frappe’s System Manager role.
_Avoid_: System Manager, installer, Project Admin

**Project Admin**:
A Project Member with authority to manage the Project and its membership, including deleting the Project; every Project retains at least one Project Admin. This authority applies through Envision, native ERPNext surfaces, and APIs.
_Avoid_: Owner, workspace admin

**Project Member**:
A participant who can edit Project work through Envision, native ERPNext surfaces, and APIs.
_Avoid_: Editor, contributor

**Project Viewer**:
A participant who cannot change Project work through any surface but may create and manage their own private Custom Views.
_Avoid_: Guest, read-only member

## ERPNext Host

**Frappe Identity**:
The authentication, session, User, and System Manager capabilities supplied and managed by Frappe; Envision consumes them but does not own them.
_Avoid_: Envision account, Envision authentication

**Envision Desk Workspace**:
The Frappe Desk area for Envision setup, configuration, and native records; Envision role management joins it in the next version. It is not an Envision collaboration or ownership boundary.
_Avoid_: Workspace, Project, daily operating view

**Envision Interface**:
The dedicated full-screen application used for daily work. Its Paper navigation includes global Home, My tasks, Inbox, and Settings plus Project-scoped Tasks, Milestones, Modules, Message Board, Project Todos, Settings, and private Views. My tasks has private Views of its own.
_Avoid_: Desk Workspace, native Task form

## Completion and Deletion

**Cancelled Task**:
Not supported in Envision. Envision has no way to cancel or reopen a Task. Tasks cancelled in ERPNext are hidden and excluded from completed work and Milestone progress. To remove a Task, delete it.
_Avoid_: Done Task, Deleted Task

**Deleted Task**:
A Task permanently removed after confirmation. Deleting a parent deletes its entire descendant tree immediately, including cancelled Subtasks. The user must have ERPNext delete permission on every Task being removed; linked records may prevent deletion, in which case the whole tree remains unchanged. Envision does not support archiving, a retention window, Undo, or restoration, and deleted Tasks are not kept in Frappe's Deleted Document recovery store. Project-role restrictions belong to the next version.
_Avoid_: Cancelled Task, Archived Task, trashed task

## ERP documentation basis

- ERPNext Project: `https://docs.frappe.io/erpnext/project`
- ERPNext Task: `https://docs.frappe.io/erpnext/tasks`
- ERPNext Project Views: `https://docs.frappe.io/erpnext/project-views`
- ERPNext task assignment: `https://docs.frappe.io/erpnext/bulk-assign-tasks-in-a-project`
- Frappe Assignments and ToDos: `https://docs.frappe.io/framework/assignments-and-todos`
- Frappe Notifications: `https://docs.frappe.io/framework/notifications`
- Frappe document tags: `https://docs.frappe.io/framework/user/en/api/document#docadd_tag`
