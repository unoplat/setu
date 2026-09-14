import { useCommandActions } from "@/lib/command-actions"
import { useCommand } from "@/lib/commands"

/** Registers the app-wide commands' shortcuts. Mounted once in the shell. */
export function GlobalCommands() {
  const actions = useCommandActions()
  useCommand("nav.projects", actions["nav.projects"] ?? noop)
  useCommand("nav.myTasks", actions["nav.myTasks"] ?? noop)
  useCommand("nav.inbox", actions["nav.inbox"] ?? noop)
  useCommand("nav.settings", actions["nav.settings"] ?? noop)
  useCommand("project.new", actions["project.new"] ?? noop)
  useCommand("theme.toggle", actions["theme.toggle"] ?? noop)
  return null
}

function noop() {}
