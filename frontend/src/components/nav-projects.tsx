import { Link, useMatchRoute } from "@tanstack/react-router"
import { FolderIcon, PlusIcon } from "lucide-react"

import { openCreateProject } from "@/components/create-project/store"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { ProjectSummary } from "@/lib/projects"

export function NavProjects({
  projects,
}: {
  projects: readonly ProjectSummary[]
}) {
  const matchRoute = useMatchRoute()
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarGroupAction title="New project" onClick={openCreateProject}>
        <PlusIcon />
        <span className="sr-only">New project</span>
      </SidebarGroupAction>
      <SidebarMenu>
        {projects.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              tooltip={item.project_name}
              isActive={Boolean(
                matchRoute({
                  to: "/projects/$name",
                  params: { name: item.name },
                })
              )}
              render={
                <Link to="/projects/$name" params={{ name: item.name }} />
              }
            >
              <FolderIcon />
              <span>{item.project_name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
