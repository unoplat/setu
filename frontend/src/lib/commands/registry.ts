import type { Hotkey } from "@tanstack/react-hotkeys"

/**
 * Command registry.
 *
 * A command is *what* happens ("New project"); a binding is *how* it is
 * triggered (`N`, or the sequence `G` then `P`). The registry only carries the
 * default binding; the effective binding (with user overrides) lives in
 * `bindings.ts`, so users can rebind commands without touching the handlers.
 *
 * Scopes decide when a command may fire (see `scopes.ts`): `global` commands
 * work everywhere except under a modal scope, and modal scopes (dialogs) only
 * expose their own commands.
 */

export type CommandScope =
  | "global"
  | "create-project"
  | "project-settings"
  | "create-milestone"
  | "milestone"
  | "milestone-comment"
  | "create-module"
  | "module"
  | "module-comment"
  | "create-task"
  | "task"
  | "task-comment"
  | "confirm"
  | "shortcut-recorder"

export const SCOPES: Record<CommandScope, { label: string; modal: boolean }> = {
  global: { label: "Everywhere", modal: false },
  "create-project": { label: "Create project dialog", modal: true },
  "create-milestone": { label: "Create milestone panel", modal: true },
  // Pages, not dialogs. The comment box is its own scope, active only while
  // it has focus, so ⌘↵ there posts the comment instead of saving the
  // description.
  milestone: { label: "Milestone", modal: false },
  "milestone-comment": { label: "Milestone comment box", modal: false },
  "create-module": { label: "Create module panel", modal: true },
  module: { label: "Module", modal: false },
  "module-comment": { label: "Module comment box", modal: false },
  "create-task": { label: "Create task panel", modal: true },
  task: { label: "Task", modal: false },
  "task-comment": { label: "Task comment box", modal: false },
  // A page, not a dialog: global navigation keeps working on it.
  "project-settings": { label: "Project settings", modal: false },
  // Owns no commands: a Delete or Archive confirm is open, and nothing
  // behind it should fire.
  confirm: { label: "Confirm dialog", modal: true },
  // Owns no commands; pushed while recording so nothing else fires.
  "shortcut-recorder": { label: "Recording a shortcut", modal: true },
}

export type Binding =
  | { kind: "hotkey"; hotkey: Hotkey }
  | { kind: "sequence"; keys: Hotkey[] }

export function hotkey(value: Hotkey): Binding {
  return { kind: "hotkey", hotkey: value }
}

export function sequence(...keys: Hotkey[]): Binding {
  return { kind: "sequence", keys }
}

export type CommandGroup =
  | "Navigation"
  | "Projects"
  | "Create project"
  | "Project settings"
  | "Create milestone"
  | "Milestone"
  | "Create module"
  | "Module"
  | "Create task"
  | "Task"
  | "General"

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  "Navigation",
  "Projects",
  "Create project",
  "Project settings",
  "Create milestone",
  "Milestone",
  "Create module",
  "Module",
  "Create task",
  "Task",
  "General",
]

interface CommandSpec {
  title: string
  description: string
  group: CommandGroup
  scope: CommandScope
  defaultBinding: Binding | null
  /**
   * Override TanStack Hotkeys' smart default. Left unset, single keys and
   * Shift/Alt chords are ignored while typing in inputs; Mod chords and
   * Escape still fire there.
   */
  ignoreInputs?: boolean
  /** Listed in the ⌘K palette. Commands tied to a dialog stay out of it. */
  inPalette?: boolean
}

export const COMMANDS = {
  "palette.open": {
    title: "Search",
    description: "Search tasks, modules, milestones, projects and actions.",
    group: "General",
    scope: "global",
    defaultBinding: hotkey("Mod+K"),
  },
  "theme.toggle": {
    title: "Toggle dark mode",
    description: "Switch between light and dark appearance.",
    group: "General",
    scope: "global",
    defaultBinding: hotkey("D"),
    inPalette: true,
  },
  "nav.projects": {
    title: "Go to Projects",
    description: "Open the Projects landing page.",
    group: "Navigation",
    scope: "global",
    defaultBinding: sequence("G", "P"),
    inPalette: true,
  },
  "nav.myTasks": {
    title: "Go to My tasks",
    description: "Open your task list.",
    group: "Navigation",
    scope: "global",
    defaultBinding: sequence("G", "T"),
    inPalette: true,
  },
  "nav.inbox": {
    title: "Go to Inbox",
    description: "Open your inbox.",
    group: "Navigation",
    scope: "global",
    defaultBinding: sequence("G", "I"),
    inPalette: true,
  },
  "nav.settings": {
    title: "Go to Settings",
    description: "Open application settings.",
    group: "Navigation",
    scope: "global",
    defaultBinding: sequence("G", "S"),
    inPalette: true,
  },
  "project.new": {
    title: "New project",
    description: "Open the Create Project dialog.",
    group: "Projects",
    scope: "global",
    defaultBinding: hotkey("N"),
    inPalette: true,
  },
  "createProject.toggleDescription": {
    title: "Expand or collapse description",
    description:
      "Switch the description between the compact field and the full editor.",
    group: "Create project",
    scope: "create-project",
    defaultBinding: hotkey("Mod+Shift+Enter"),
  },
  "createProject.collapseDescription": {
    title: "Return to the form",
    description: "Leave the full description editor, keeping the draft.",
    group: "Create project",
    scope: "create-project",
    defaultBinding: hotkey("Escape"),
  },
  "createProject.submitStep": {
    title: "Create project",
    description: "Submit the Create Project form from any field.",
    group: "Create project",
    scope: "create-project",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "projectSettings.toggleDescription": {
    title: "Expand or collapse description",
    description:
      "Switch the project description between the field and the full editor.",
    group: "Project settings",
    scope: "project-settings",
    defaultBinding: hotkey("Mod+Shift+Enter"),
  },
  "projectSettings.collapseDescription": {
    title: "Return to settings",
    description: "Leave the full description editor, keeping the edits.",
    group: "Project settings",
    scope: "project-settings",
    defaultBinding: hotkey("Escape"),
  },
  "projectSettings.save": {
    title: "Save changes",
    description: "Save the project's name and description from any field.",
    group: "Project settings",
    scope: "project-settings",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "createMilestone.toggleDescription": {
    title: "Expand or collapse description",
    description:
      "Switch the milestone description between the field and the full editor.",
    group: "Create milestone",
    scope: "create-milestone",
    defaultBinding: hotkey("Mod+Shift+Enter"),
  },
  "createMilestone.collapseDescription": {
    title: "Return to the form",
    description: "Leave the full description editor, keeping the draft.",
    group: "Create milestone",
    scope: "create-milestone",
    defaultBinding: hotkey("Escape"),
  },
  "createMilestone.submit": {
    title: "Create milestone",
    description: "Submit the Create Milestone form from any field.",
    group: "Create milestone",
    scope: "create-milestone",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "milestone.toggleDescription": {
    title: "Expand or collapse description",
    description:
      "Switch the milestone description between the field and the full editor.",
    group: "Milestone",
    scope: "milestone",
    defaultBinding: hotkey("Mod+Shift+Enter"),
  },
  "milestone.collapseDescription": {
    title: "Return to the milestone",
    description: "Leave the full description editor, keeping the edits.",
    group: "Milestone",
    scope: "milestone",
    defaultBinding: hotkey("Escape"),
  },
  "milestone.save": {
    title: "Save now",
    description:
      "Save the milestone's edits right away instead of waiting for autosave.",
    group: "Milestone",
    scope: "milestone",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "milestone.comment": {
    title: "Post comment",
    description: "Post the comment you are writing on a milestone.",
    group: "Milestone",
    scope: "milestone-comment",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "createModule.toggleDescription": {
    title: "Expand or collapse description",
    description:
      "Switch the module description between the field and the full editor.",
    group: "Create module",
    scope: "create-module",
    defaultBinding: hotkey("Mod+Shift+Enter"),
  },
  "createModule.collapseDescription": {
    title: "Return to the form",
    description: "Leave the full description editor, keeping the draft.",
    group: "Create module",
    scope: "create-module",
    defaultBinding: hotkey("Escape"),
  },
  "createModule.submit": {
    title: "Create module",
    description: "Submit the Create Module form from any field.",
    group: "Create module",
    scope: "create-module",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "module.toggleDescription": {
    title: "Expand or collapse description",
    description:
      "Switch the module description between the field and the full editor.",
    group: "Module",
    scope: "module",
    defaultBinding: hotkey("Mod+Shift+Enter"),
  },
  "module.collapseDescription": {
    title: "Return to the module",
    description: "Leave the full description editor, keeping the edits.",
    group: "Module",
    scope: "module",
    defaultBinding: hotkey("Escape"),
  },
  "module.save": {
    title: "Save now",
    description:
      "Save the module's edits right away instead of waiting for autosave.",
    group: "Module",
    scope: "module",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "module.comment": {
    title: "Post comment",
    description: "Post the comment you are writing on a module.",
    group: "Module",
    scope: "module-comment",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "createTask.submit": {
    title: "Create task",
    description: "Submit the Create Task form from any field.",
    group: "Create task",
    scope: "create-task",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "task.toggleDescription": {
    title: "Expand or collapse description",
    description:
      "Switch the task description between the field and the full editor.",
    group: "Task",
    scope: "task",
    defaultBinding: hotkey("Mod+Shift+Enter"),
  },
  "task.collapseDescription": {
    title: "Return to the task",
    description: "Leave the full description editor, keeping the edits.",
    group: "Task",
    scope: "task",
    defaultBinding: hotkey("Escape"),
  },
  "task.save": {
    title: "Save now",
    description:
      "Save the task's edits right away instead of waiting for autosave.",
    group: "Task",
    scope: "task",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
  "task.comment": {
    title: "Post comment",
    description: "Post the comment you are writing on a task.",
    group: "Task",
    scope: "task-comment",
    defaultBinding: hotkey("Mod+Enter"),
    ignoreInputs: false,
  },
} as const satisfies Record<string, CommandSpec>

export type CommandId = keyof typeof COMMANDS

export interface CommandDefinition extends CommandSpec {
  id: CommandId
}

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[]

export function getCommand(id: CommandId): CommandDefinition {
  return { id, ...(COMMANDS[id] as CommandSpec) }
}

export function listCommands(): CommandDefinition[] {
  return COMMAND_IDS.map(getCommand)
}

export function isCommandId(value: string): value is CommandId {
  return Object.hasOwn(COMMANDS, value)
}
