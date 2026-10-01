import { createFileRoute, Outlet } from "@tanstack/react-router"

import { CreateProjectDialog } from "@/components/create-project/create-project-dialog"
import { EnvisionSidebar } from "@/components/envision-sidebar"
import { GlobalCommands } from "@/components/global-commands"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { ViewDialogs } from "@/components/views/view-dialogs"

// Pathless layout: the Envision app shell (sidebar + content area) shared by
// every product screen. Adds no URL segment. Also hosts the app-wide
// commands, the single Create Project wizard instance, the Custom View
// dialogs and the toast stack.
export const Route = createFileRoute("/_authenticated/_shell")({
  component: ShellLayout,
})

function ShellLayout() {
  return (
    <SidebarProvider>
      <GlobalCommands />
      <EnvisionSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      <CreateProjectDialog />
      <ViewDialogs />
      <Toaster position="bottom-right" />
    </SidebarProvider>
  )
}
