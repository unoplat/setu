# Envision

**Open-source product management on top of ERPNext.** Plan work by product area and milestone, follow your own tasks across projects, and keep GitHub Issues in sync without leaving a keyboard-first board. Envision is built for first-class integration with [Unoplat Code Confluence](https://docs.unoplat.io), which will supply agent context and automatic documentation drawn from your code.

[![Release](https://img.shields.io/github/v/release/unoplat/setu?label=release)](CHANGELOG.md)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue)](license.txt)
![Frappe v16](https://img.shields.io/badge/Frappe-v16-0089ff)
![Status: alpha](https://img.shields.io/badge/status-alpha-orange)

Envision is a Frappe app that runs inside your ERPNext site.

> [!WARNING]
> Envision is in alpha. Releases can include breaking changes, such as changes to data models, APIs, settings, or integrations.

**Contents:** [Available today](#available-today) · [Coming next](#coming-next) · [Keyboard shortcuts](#keyboard-shortcuts) · [Getting started](#getting-started) · [Release notes](#release-notes) · [License](#license)

## Available today

| Area | What you get |
| --- | --- |
| **Planning** | Module × status board, milestones with live progress, subtasks, priorities, tags, dates |
| **Personal work** | My tasks across projects, private saved views, Inbox for assignments and mentions |
| **GitHub** | Two-way sync of Issues, comments, status, and sub-issues |
| **Collaboration** | Comments with mentions and quotes, live activity, project Links board |
| **Search** | Raycast-inspired, one-click search across all your data, along with actions (`Cmd/Ctrl+K`) |

## Coming next

| Area | What's planned |
| --- | --- |
| **Code Confluence** | First-class integration with [Unoplat Code Confluence](https://docs.unoplat.io) for agent context and automatic documentation |
| **Collaboration** | Message board per project, then roles, membership, and per-project permissions |
| **Personal work** | Smart notifications |
| **Releases** | Release integration that connects tasks and milestones with what ships |
| **Knowledge** | Wiki for product docs, decisions, and team guides |

Order and dates are not committed. Have an idea or a need that isn't listed? [Open an issue](https://github.com/unoplat/setu/issues).

## Keyboard shortcuts

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

Every shortcut can be changed in **Settings**. Record a single key, a chord, or a sequence. Envision warns you about conflicts, and you can reset one shortcut or all of them.

## Getting started

### Requirements

- Frappe Framework v16 and ERPNext, on a working [bench](https://docs.frappe.io/framework/user/en/installation)
- Python 3.14 or later

### Install

```bash
bench get-app https://github.com/unoplat/setu
bench --site <your-site> install-app setu
```

Open **Envision** from the apps screen, or go to `/envision` on your site. Projects you create in Envision are enabled for it automatically.

### Connect GitHub (optional)

1. In Envision, open **Settings → GitHub**, then create the GitHub App for your organization and install it.
2. Open a project's settings, choose a repository, and turn on Issue sync.

> [!NOTE]
> Publishing to GitHub shares task content with everyone who can access the selected repository.

Envision uses ERPNext's existing role permissions for Projects and Tasks. Anyone who can edit a task in ERPNext can edit it in Envision.

## Release notes

See [CHANGELOG.md](CHANGELOG.md) for every release.

## License

[GNU Affero General Public License v3.0](license.txt).
