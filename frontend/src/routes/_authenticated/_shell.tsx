import { createFileRoute, Outlet } from "@tanstack/react-router"

import { EnvisionSidebar } from "@/components/envision-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

// Pathless layout: the Envision app shell (sidebar + content area) shared by
// every product screen. Adds no URL segment.
export const Route = createFileRoute("/_authenticated/_shell")({
  component: ShellLayout,
})

function ShellLayout() {
  return (
    <SidebarProvider>
      <EnvisionSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
