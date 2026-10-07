# Envision

A planning and knowledge engine for teams building SaaS products.

Today, Envision helps teams plan work with a board organized by product area, milestones that track linked tasks, and a personal view across projects. We are building toward connecting that work to code, releases, and shared knowledge. See the [roadmap](#roadmap) for what's next.

## What you can do today

### Plan by product area and milestone

- Organize tasks into modules. Each module represents a lasting area of your product and can have a lead and a description.
- Move tasks through Todo, In Progress, Review, Blocked, and Done. Modules appear as rows on the board. Drag a card between rows to change its module, or between columns to change its status. You can undo a move.
- Track delivery targets with milestones and due dates. Progress updates as linked tasks reach Done. Each task can belong to one module and one milestone.
- Assign tasks to multiple people and set priorities, tags, start dates, and due dates.

### Focus on your own work

- See your assigned work across projects in My tasks, including completed tasks.
- Save private views filtered by milestone, priority, or tag. Project views can filter by assignee; My tasks views can filter by project.
- Open saved views on another device. They show filtered shared tasks, not separate copies.

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

- Subtasks to break tasks into smaller pieces of work.
- A smart notification system that prioritizes relevant updates without constant interruptions.
- Granular roles and permissions to control who can view, create, edit, and manage work in each project.
- A discussion board per project for ongoing conversations and announcements.

### Code and releases

- GitHub integration to connect planned work with repository activity.
- Release integration to connect tasks and milestones with what ships.

### Knowledge

- Wiki-based knowledge management for product documentation, decisions, and team guides.
- Automatic documentation using [Unoplat Code Confluence](https://github.com/unoplat/unoplat-code-confluence), drawing on code context extracted from repositories.
- Agent artifacts connected to the work they support.

## License

[GNU Affero General Public License v3.0](license.txt).
