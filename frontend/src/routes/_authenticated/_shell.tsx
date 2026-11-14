import { createFileRoute, Outlet } from "@tanstack/react-router"

import { CreateProjectDialog } from "@/components/create-project/create-project-dialog"
import { EnvisionSidebar } from "@/components/envision-sidebar"
import { GlobalCommands } from "@/components/global-commands"
import { MobileTabBar } from "@/components/mobile-tab-bar"
import { SearchPalette } from "@/components/search/search-palette"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { ViewDialogs } from "@/components/views/view-dialogs"

// Pathless layout: the Envision app shell (sidebar + content area) shared by
// every product screen. Adds no URL segment. Also hosts the app-wide
// commands, the single search palette and Create Project wizard instances,
// the Custom View dialogs, the phone's tab bar and the toast stack.
export const Route = createFileRoute("/_authenticated/_shell")({
  component: ShellLayout,
})

function ShellLayout() {
  return (
    <SidebarProvider>
      <GlobalCommands />
      <EnvisionSidebar />
      {/* min-w-0: without it the inset cannot shrink below its w-full, so
          wide content (the Kanban rows) pushes the page sideways under the
          fixed sidebar instead of scrolling inside its own scroller. */}
      {/* max-md:mb: room for the phone's tab bar; index.css sets
          --tab-bar-h only while the bar is shown. */}
      <SidebarInset className="min-w-0 max-md:mb-(--tab-bar-h)">
        <Outlet />
      </SidebarInset>
      <MobileTabBar />
      <SearchPalette />
      <CreateProjectDialog />
      <ViewDialogs />
      {/* Toasts stand clear of the tab bar; 24px and 16px are sonner's own
          offsets, which they keep wherever the bar is not shown. */}
      <Toaster
        position="bottom-right"
        offset={{ bottom: "calc(var(--tab-bar-h, 0px) + 24px)" }}
        mobileOffset={{ bottom: "calc(var(--tab-bar-h, 0px) + 16px)" }}
      />
    </SidebarProvider>
  )
}
