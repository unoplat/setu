# Envision

An open-source product planning app built on ERPNext and the Frappe Framework.

Envision works with ERPNext Project and Task records. Plan work by product area and milestone, follow your tasks across projects, and connect a project's tasks with GitHub Issues. See the [roadmap](#roadmap) for what's next.

> [!WARNING]
> Envision is in alpha. Releases can include breaking changes, such as changes to data models, APIs, settings, or integrations.

## What you can do today

### Plan by product area and milestone

- Organize tasks into modules. Each module represents a lasting area of your product and can have a lead and a description.
- Move tasks through Todo, In Progress, Review, Blocked, and Done. Modules appear as rows on the board. Drag a card between rows to change its module, or between columns to change its status. You can undo a move.
- Track delivery targets with milestones and due dates. Progress updates as linked tasks reach Done. Each task can belong to one module and one milestone.
- Break work into subtasks and manage parent-child task relationships.
- Assign tasks to multiple people and set priorities, tags, start dates, and due dates.
- View and filter linked tasks from modules and milestones.

### Focus on your own work

- See your assigned work across projects in My tasks, including completed tasks.
- Save private views filtered by milestone, priority, or tag. Project views can filter by assignee; My tasks views can filter by project.
- Open saved views on another device. They show filtered shared tasks, not separate copies.
- See assignments and mentions in the Inbox, with an unread badge and filters.

### Connect work to GitHub

- Connect a GitHub repository to a project and enable Issue sync in the project settings.
- Import eligible open Issues as tasks. Publish a task to GitHub by adding the `github` tag and confirming the destination.
- Keep linked task and Issue titles, descriptions, statuses, and comments in sync. Envision also synchronizes supported parent and sub-issue relationships.
- See sync status and retry failed updates in Envision. Publishing to GitHub shares task content with the people who can access the selected repository.

### Discuss and keep context

- Write rich-text descriptions and follow changes through activity history.
- Comment on tasks, milestones, modules, and links. Mention people or quote a comment when replying. New comments and activity appear on an open page without refreshing.
- Keep project resources in a Links board with descriptions and built-in or custom link types.

### Work from the keyboard

Envision is keyboard-first. You can search, move around, create, save, and comment without reaching for the mouse.

- Search tasks, milestones, modules, links, projects, and actions with `Cmd+K` or `Ctrl+K`. Every action in the search palette shows its shortcut.
- Move between pages with two-key sequences, such as `G` then `P` for Projects.
- Submit any create form from any field, save edits right away, or post a comment with `Cmd+Enter` or `Ctrl+Enter`. Edits to tasks, milestones, modules, and links also save automatically.
- Expand a description into a focused full-height editor with `Cmd+Shift+Enter` or `Ctrl+Shift+Enter`, and press `Esc` to return to the form. Type `/` in the editor for headings, checklists, code blocks, and more.
- Move board cards with the keyboard as well as by dragging.

Default shortcuts:

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+K` | Search |
| `G` then `P` | Go to Projects |
| `G` then `T` | Go to My tasks |
| `G` then `I` | Go to Inbox |
| `G` then `S` | Go to Settings |
| `N` | New project |
| `D` | Toggle dark mode |
| `Cmd/Ctrl+Enter` | Create, save now, or post a comment, depending on where you are |
| `Cmd/Ctrl+Shift+Enter` | Expand or collapse the description editor |
| `Esc` | Leave the full description editor, keeping your edits |

Every shortcut can be changed in **Settings**. Record a single key, a chord, or a sequence. Envision warns you when a new shortcut conflicts with an existing one, and you can reset one shortcut or all of them.

## Roadmap

These capabilities are planned, not yet available. Delivery order and dates are not committed.

### Planning and team coordination

- A smart notification system that prioritizes relevant updates without constant interruptions.
- Granular roles and permissions to control who can view, create, edit, and manage work in each project.
- A discussion board per project for ongoing conversations and announcements.

### Code and releases

- Release integration to connect tasks and milestones with what ships.

### Knowledge

- Wiki-based knowledge management for product documentation, decisions, and team guides.
- Automatic documentation using [Unoplat Code Confluence](https://github.com/unoplat/unoplat-code-confluence), drawing on code context extracted from repositories.
- Agent artifacts connected to the work they support.

## License

[GNU Affero General Public License v3.0](license.txt).
