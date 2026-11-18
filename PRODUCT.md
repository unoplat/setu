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

Envision is an open-source product planning app built on ERPNext and the Frappe Framework. It keeps project work, personal follow-up, and the GitHub Issues a team already uses in one application on top of standard ERPNext Project and Task records. The Kanban Board remains the primary operating view, while Inbox and My tasks provide focused views for attention and ownership. The interface is keyboard-first.

## Operating Context

Teams switch among Envision-enabled Projects from a persistent sidebar. Global navigation provides Home, My tasks, Inbox, and application Settings. Each Project exposes Tasks, Milestones, Modules, Links, Project Settings, and private Views; My tasks has private Views of its own. In the first version the signed-in user's Frappe identity and ERPNext role permissions determine what is available; Envision roles and Project membership arrive in the next version.

The primary Project workflow is a Kanban Board. Modules appear as rows on the Board and statuses as columns. Users scan the Board, filter Tasks, open or move Cards, and add Tasks without leaving it.

Envision is used on desktop and on phones. Every screen must work at phone width and is tested there. Status belongs to the column; each Card carries the Task information that remains useful when it moves.

## Capabilities and Constraints

### Navigation and personal work

- Multi-Project navigation with expandable Project sections and visible signed-in identity. The Envision role label arrives with roles in the next version.
- Global Home, My tasks, Inbox, and application Settings.
- Project-scoped Tasks, Milestones, Modules, Links, Settings, and private Views.
- My tasks shows the Tasks assigned to the signed-in user across every Envision-enabled Project, Done Tasks included, with private Views of its own.
- Search palette (`Cmd/Ctrl+K`) for Tasks, Milestones, Modules, Links, Projects, and actions; every action shows its shortcut.
- Inbox shows assignments and mentions with an unread badge and filters.
- Message Board and Project Todos appear in the Paper design but are not built. Their purpose and ERPNext record basis are still undecided.

### Keyboard-first

- Two-key navigation sequences (for example `G` then `P` for Projects), `N` for a new Project, `D` for dark mode.
- `Cmd/Ctrl+Enter` creates, saves, or posts a comment from any field; `Cmd/Ctrl+Shift+Enter` expands the description into a full-height editor; `Esc` returns with edits kept.
- Board Cards can be moved with the keyboard as well as by dragging.
- Every shortcut is rebindable in Settings (single key, chord, or sequence), with conflict warnings and reset.

### Planning records

- Modules are lasting product areas with an optional lead and description; they form the Board's rows. Dragging a Card between rows changes its Module; moves can be undone.
- Milestones have due dates and progress that advances as linked Tasks reach Done. A Task belongs to at most one Module and one Milestone.
- Subtasks and parent-child Task relationships; multiple assignees, priorities, tags, start and due dates.
- Rich-text descriptions with slash commands, activity history, and comments with mentions and quoting on Tasks, Milestones, Modules, and Links. New comments and activity appear live.
- A Links board per Project holds resources with descriptions and built-in or custom link types.

### GitHub Issue sync

- A Project connects to a GitHub repository with Issue sync enabled in Project Settings.
- Eligible open Issues import as Tasks. A Task publishes to GitHub when given the `github` tag and the destination is confirmed; publishing shares Task content with everyone who can access that repository.
- Linked titles, descriptions, statuses, comments, and supported parent/sub-issue relationships stay in sync. Sync status is visible and failed updates can be retried.

### Kanban Board

- Status columns with column actions. Neither column headers nor the Module sections within them show Task counts. Each column represents the Task's Status; the Board shows Todo, In Progress, Review, Blocked, Done, and Cancelled.
- Task Cards can be opened by click or Enter and moved between columns by dragging.
- Cancelling a Task moves it to the Cancelled column. Cancelled Tasks do not count as completed work or Milestone progress, and cancelling a linked Task closes its GitHub Issue as not planned.
- Tasks can be added from every Board column except Cancelled.
- The Board must remain workable at phone width, not only readable.
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
- Paper labels such as Message Board and Project Todos do not by themselves establish an ERPNext or Envision DocType.
- Envision is in alpha; releases can include breaking changes to data models, APIs, settings, or integrations.
- Every screen must be tested at phone width as well as desktop. No deployment target or browser matrix beyond that has been decided.
- Planned, not committed: smarter notifications, granular roles and permissions, a per-Project discussion board, release integration, a wiki, automatic documentation via Unoplat Code Confluence, and agent artifacts linked to work.

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
- Every action reachable by keyboard; every screen usable on a phone.
