import { Link } from "@tanstack/react-router"
import { BellIcon, SettingsIcon, SquareCheckIcon } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavSearch } from "@/components/nav-search"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useProjects } from "@/lib/projects"

// Paper: "Projects Sidebar — Empty" (00 — Empty Projects), built on the
// shadcn sidebar-07 block (collapses to icons).
// Global navigation is My tasks, Inbox, Settings; Projects lists open
// Projects (filtered to Envision-enabled ones once that flag exists).

const NAV = [
  { title: "My tasks", to: "/my-tasks", icon: <SquareCheckIcon /> },
  { title: "Inbox", to: "/inbox", icon: <BellIcon /> },
  { title: "Settings", to: "/settings", icon: <SettingsIcon /> },
] as const

export function EnvisionSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { data: projects } = useProjects()
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                E
              </div>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-medium">Envision</span>
                <span className="truncate text-xs">Project work</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavSearch items={NAV} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV} />
        <NavProjects projects={projects ?? []} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
