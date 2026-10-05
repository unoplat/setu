import { Link } from "@tanstack/react-router"
import { BellIcon, SettingsIcon, SquareCheckIcon } from "lucide-react"

import { NavMain, type NavItem } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavSearch } from "@/components/nav-search"
import { NavUser } from "@/components/nav-user"
import { NavMyTasksViews } from "@/components/views/nav-views"
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
// Global navigation is My tasks, Inbox, Settings; Projects lists the
// Envision-managed projects. My tasks lists its own Views beneath it while it
// is open (Paper: My Tasks 06), as a Project lists its sections and Views.

const NAV: readonly NavItem[] = [
  {
    title: "My tasks",
    to: "/my-tasks",
    icon: <SquareCheckIcon />,
    command: "nav.myTasks",
    sub: <NavMyTasksViews />,
  },
  { title: "Inbox", to: "/inbox", icon: <BellIcon />, command: "nav.inbox" },
  {
    title: "Settings",
    to: "/settings",
    icon: <SettingsIcon />,
    command: "nav.settings",
  },
]

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
        <NavSearch />
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
