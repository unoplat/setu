# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite

## Users

Developer teams building SaaS products. Their primary job is to organize and move project work through delivery while keeping priorities and milestones visible.

## Product Purpose

Envision is a SaaS project-management product centered on a Kanban board. It should help teams manage tasks with less administrative effort. Success means teams spend materially less time updating and reconciling their project-management system.

## Positioning

Envision keeps project work, personal follow-up, and team communication in one application. The Kanban Board remains the primary operating view, while Inbox, My tasks, and Message Board provide focused views for attention, ownership, and discussion.

## Operating Context

Teams switch among Envision-enabled Projects from a persistent sidebar. Global navigation provides Home, My tasks, Inbox, and application Settings. Each Project exposes Tasks, Milestones, Modules, Message Board, Todos, Project Settings, and private Views; My tasks has private Views of its own. In the first version the signed-in user's Frappe identity and ERPNext role permissions determine what is available; Envision roles and Project membership arrive in the next version.

The primary Project workflow is a Kanban Board. Users scan status columns, filter Tasks, open or move Cards, and add Tasks without leaving the Board. Status belongs to the column; each Card carries the Task information that remains useful when it moves.

## Capabilities and Constraints

### Navigation and personal work

- Multi-Project navigation with expandable Project sections and visible signed-in identity. The Envision role label arrives with roles in the next version.
- Global Home, My tasks, Inbox, and application Settings.
- Project-scoped Tasks, Milestones, Modules, Message Board, Todos, Settings, and private Views.
- My tasks shows the Tasks assigned to the signed-in user across every Envision-enabled Project, Done Tasks included, with private Views of its own.
- Search entry point for Tasks and actions, with a keyboard shortcut shown in the interface.
- The Paper design distinguishes global My tasks from Project-scoped Todos. The exact purpose and ERPNext record basis of Project Todos are still undecided.

### Kanban Board

- Status columns with column actions. Neither column headers nor the Module sections within them show Task counts. Each column represents the Task's Status; the Board shows Todo, In Progress, Review, Blocked, and Done.
- Task Cards can be opened by click or Enter and moved between columns by dragging.
- Envision does not support cancelling Tasks. Tasks cancelled in ERPNext do not appear on the Board and do not count as completed work or Milestone progress.
- Tasks can be added from a Board column.
- Board view selection plus general, Milestone, and Priority filters.
- Private Custom Views appear within their Project, or under My tasks, and preserve reusable Board configurations. My tasks views can also filter by Project and are always limited to the signed-in user's own Tasks.

### Task Cards

- The Task Card specification requires the ERPNext Task ID, title, Expected Start Date presented as Start Date, and Expected End Date presented as Due Date.
- Optional planning and ownership context can include Priority, assignee, associated Milestone Task, and Frappe document tags.
- Cards show no separate Status field because the Board column supplies Status.
- Tag overflow shows two tags and a `+N` trigger that reveals the full list.
- Compact and comfortable density change spacing without changing Card content.
- Selected, dragging, keyboard-focus, and overdue states must be explicit.

### Deferred to the next version

The first version has no Envision access model. Creating a Project is a single step (name and optional description), and access follows ERPNext's standard Project and Task role permissions. The following are deliberately out of the first version and planned for the next one:

- Inviting people to a Project, during creation or afterwards.
- Project membership and the roles Envision Administrator, Project Admin, Project Member, and Project Viewer.
- Projects visible only to their members, and any Envision permission rules on Project or Task.
- Restricting Task assignees to Project Members.
- Controls, Settings options, and a sidebar role label that depend on an Envision role.

### Product constraints and open decisions

- Standard ERPNext and Frappe DocTypes must be reused when official documentation establishes a compatible record. Envision-owned DocTypes require an explicit gap and architecture decision.
- Paper labels such as Modules, Message Board, Inbox, and Project Todos do not by themselves establish an ERPNext or Envision DocType.
- No deployment target or browser matrix has been decided yet.

## Evidence on Hand

- Paper file `Envision-Erpnext`: `https://app.paper.design/file/01M0J1FVXVRP4MW8M8M4TDCHT9`. The Home Page contains the Envision Interface and Kanban Board; the Components page contains the Task Card specification.
- A React and Vite frontend scaffold and shared UI components exist under `frontend/`.
- Official ERPNext documentation confirms Project and Task records, Task Status and Priority values, Expected Start Date, Expected End Date, milestone Tasks, parent Tasks, assignments, and status-based Kanban movement. Frappe documentation confirms ToDo-backed assignments, system Notifications, and document tags.
- No customer proof, testimonials, benchmarks, or performance evidence are available. Future work must not fabricate them.

## Product Principles

- Keep the Kanban Board focused on planning and Task movement.
- Keep Status in the Board column and only portable work context on the Card.
- Separate global personal work from Project-scoped work and configuration.
- Reuse documented ERPNext and Frappe records before creating Envision-owned DocTypes.
- Make status, priority, ownership, dates, and Milestone relationships immediately legible.
- Reduce project-management upkeep rather than adding process.
