import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { GitHubSettings } from "@/components/settings/github-settings"
import { ShortcutSettings } from "@/components/settings/shortcut-settings"
import { SidebarTrigger } from "@/components/ui/sidebar"

// Global application settings (Project-scoped settings live under a Project).
// Not designed in Paper yet; uses existing Settings conventions.
export const Route = createFileRoute("/_authenticated/_shell/settings")({
  validateSearch: z.object({
    github_result: z
      .enum([
        "connected",
        "pending",
        "registration_failed",
        "installation_failed",
      ])
      .optional()
      .catch(undefined),
  }),
  component: SettingsPage,
})

function SettingsPage() {
  const { github_result } = Route.useSearch()
  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">Settings</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid w-full max-w-3xl gap-10">
          <GitHubSettings result={github_result} />
          <ShortcutSettings />
        </div>
      </main>
    </>
  )
}
