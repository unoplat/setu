import { createFileRoute } from "@tanstack/react-router"
import { GitBranchIcon, KeyboardIcon } from "lucide-react"
import { z } from "zod"

import { GitHubSettings } from "@/components/settings/github-settings"
import { ShortcutSettings } from "@/components/settings/shortcut-settings"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const settingsTab = z.enum(["github", "shortcuts"])

// Global application settings (Project-scoped settings live under a Project).
// Not designed in Paper yet; uses existing Settings conventions.
export const Route = createFileRoute("/_authenticated/_shell/settings")({
  validateSearch: z.object({
    tab: settingsTab.optional().catch(undefined),
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
  const { tab = "github", github_result } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">Settings</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-6">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = settingsTab.safeParse(value)
            if (!next.success) return
            void navigate({
              search: (prev) => ({ ...prev, tab: next.data }),
              replace: true,
            })
          }}
          className="mx-auto w-full max-w-3xl"
        >
          <TabsList variant="line">
            <TabsTrigger value="github">
              <GitBranchIcon />
              GitHub
            </TabsTrigger>
            <TabsTrigger value="shortcuts">
              <KeyboardIcon />
              Keyboard shortcuts
            </TabsTrigger>
          </TabsList>
          <TabsContent value="github" className="mt-4">
            <GitHubSettings result={github_result} />
          </TabsContent>
          <TabsContent value="shortcuts" className="mt-4">
            <ShortcutSettings />
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}
