# Setu Project Work

Setu is an ERPNext marketplace app that presents ERPNext project records through a focused SaaS project-management interface.

## Work Structure

**Project**:
The standard ERPNext Project record. When enabled for Setu, it becomes Setu’s top-level collaboration and access boundary and contains members, one Kanban Board, Milestones, and Custom Views.
_Avoid_: Setu Project, Workspace, standalone board

**Setu-enabled Project**:
A standard ERPNext Project explicitly opted into Setu’s workflow and interface. Projects created through Setu are enabled automatically; disabling Setu hides the Project from the Setu Interface without deleting its data.
_Avoid_: Setu Project, imported project

**Kanban Board**:
A Project’s primary operating view, where Tasks are organized by Status and may be ordered consistently within columns.
_Avoid_: Project board, task board

**Task**:
The standard ERPNext Task record presented by Setu as a unit of project work; it appears as a Card on the Kanban Board and may contain linked Subtasks.
_Avoid_: Setu Task, Issue, ticket, work item

**Task ID**:
The standard identifier assigned to a Task by ERPNext, such as `TASK-2026-00001`; Setu does not maintain a separate Project-specific identifier or sequence.
_Avoid_: Setu Task ID, Project Key, issue key

**Card**:
The visual representation of a Task on the Kanban Board.
_Avoid_: Using card for the underlying Task

**Subtask**:
A full Task linked beneath a parent Task to represent a smaller part of its work; it may contain Subtasks of its own.
_Avoid_: Checklist item, child issue

## Classification and Planning

**Status**:
A Task’s single workflow position. Setu presents ERPNext’s Open, Working, Pending Review, Overdue, Completed, and Cancelled statuses as Todo, In Progress, Review, Overdue, Done, and Cancelled, and adds Blocked.
_Avoid_: State, Setu Status, priority

**Priority**:
A Task’s urgency level: Low, Medium, High, or Urgent.
_Avoid_: Severity, rank

**Assignee**:
A Project Member responsible for a Task or Subtask.
_Avoid_: Owner

**Milestone**:
A standard ERPNext Task designated as a milestone and treated by Setu as a Project target rather than ordinary Board work. Its completion is derived when it has at least one non-cancelled associated Task and every such Task is Done; Cancelled Tasks do not contribute to its progress.
_Avoid_: Custom Setu Milestone, Sprint, iteration, release

**Due Date**:
The calendar date by which a Task is expected to be completed; Setu presents ERPNext’s Expected End Date as this date without exposing a time.
_Avoid_: Deadline, due time

**Tag**:
A site-wide ERPNext label used to categorize Tasks and filter Custom Views.
_Avoid_: Project Tag, Label, category

**Custom View**:
A private, reusable Kanban configuration that preserves structured Task filters and Board ordering for its creator.
_Avoid_: Shared view, saved search, filter preset

## Membership

**Setu Administrator**:
A global Setu role assigned through Frappe’s standard User management, with authority across Setu-enabled Projects. Frappe’s built-in Administrator has implicit access; Setu does not create or manage Frappe’s System Manager role.
_Avoid_: System Manager, installer, Project Admin

**Project Admin**:
A Project Member with authority to manage the Project and its membership, including deleting the Project; every Project retains at least one Project Admin. This authority applies through Setu, native ERPNext surfaces, and APIs.
_Avoid_: Owner, workspace admin

**Project Member**:
A participant who can edit Project work through Setu, native ERPNext surfaces, and APIs.
_Avoid_: Editor, contributor

**Project Viewer**:
A participant who cannot change Project work through any surface but may create and manage their own private Custom Views.
_Avoid_: Guest, read-only member

## ERPNext Host

**Frappe Identity**:
The authentication, session, User, and System Manager capabilities supplied and managed by Frappe; Setu consumes them but does not own them.
_Avoid_: Setu account, Setu authentication

**Setu Desk Workspace**:
The Frappe Desk surface for Setu setup, role management, configuration, and native records; it is not a Setu collaboration or ownership boundary.
_Avoid_: Workspace, Project, daily operating view

**Setu Interface**:
The dedicated full-screen application used for daily Project work, including the Kanban Board and Projects sidebar.
_Avoid_: Desk Workspace, native Task form

## Completion and Retention

**Cancelled Task**:
A Task that will not be completed and is excluded from completed work and Milestone progress. Cancelling a Task cancels every unfinished descendant after confirmation; a Project Admin or Project Member may explicitly reopen it.
_Avoid_: Done Task, Archived Task

**Archived Task**:
A Task hidden from normal views for thirty days while retaining its Status. Archiving a parent archives its entire descendant tree under the same retention window; a Project Admin or Project Member may restore the tree before permanent deletion.
_Avoid_: Cancelled Task, deleted task, trashed task
