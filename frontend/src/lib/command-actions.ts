import { useNavigate } from "@tanstack/react-router"

import { openCreateProject } from "@/components/create-project/store"
import { useTheme } from "@/components/theme-provider"

import type { CommandId } from "./commands"

/**
 * Handlers for app-level commands. One place feeds both the hotkey bindings
 * (`GlobalCommands`) and the command palette, so a command behaves the same
 * whether it is typed, clicked, or triggered by its shortcut.
 */
export function useCommandActions(): Partial<Record<CommandId, () => void>> {
  const navigate = useNavigate()
  const { toggleTheme } = useTheme()
  return {
    "nav.projects": () => void navigate({ to: "/" }),
    "nav.myTasks": () => void navigate({ to: "/my-tasks" }),
    "nav.inbox": () => void navigate({ to: "/inbox" }),
    "nav.settings": () => void navigate({ to: "/settings" }),
    "project.new": openCreateProject,
    "theme.toggle": toggleTheme,
  }
}
