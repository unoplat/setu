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

export type CommandScope = "global" | "create-project" | "shortcut-recorder"

export const SCOPES: Record<CommandScope, { label: string; modal: boolean }> = {
  global: { label: "Everywhere", modal: false },
  "create-project": { label: "Create project dialog", modal: true },
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
  | "General"

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  "Navigation",
  "Projects",
  "Create project",
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
    title: "Search projects & actions",
    description: "Open the command palette.",
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
    description: "Start the Create Project wizard.",
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
    defaultBinding: hotkey("Mod+Shift+E"),
  },
  "createProject.collapseDescription": {
    title: "Return to the form",
    description: "Leave the full description editor, keeping the draft.",
    group: "Create project",
    scope: "create-project",
    defaultBinding: hotkey("Escape"),
  },
  "createProject.submitStep": {
    title: "Continue",
    description: "Submit the current step of the wizard.",
    group: "Create project",
    scope: "create-project",
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
