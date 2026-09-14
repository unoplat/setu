import { createFileRoute } from "@tanstack/react-router"

import { ShortcutSettings } from "@/components/settings/shortcut-settings"
import { SidebarTrigger } from "@/components/ui/sidebar"

// Global application settings (Project-scoped settings live under a Project).
// Not designed in Paper yet; currently hosts keyboard shortcut customisation.
export const Route = createFileRoute("/_authenticated/_shell/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">Settings</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-3xl">
          <ShortcutSettings />
        </div>
      </main>
    </>
  )
}
