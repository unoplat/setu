import { Link, useMatchRoute } from "@tanstack/react-router"
import { FolderIcon, PlusIcon } from "lucide-react"

import { openCreateProject } from "@/components/create-project/store"
import { PROJECT_SECTIONS } from "@/components/project-sections"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { NavViews } from "@/components/views/nav-views"
import type { ProjectSummary } from "@/lib/projects"

// Paper: "Projects and Project Sections". The open project stays highlighted
// in whichever of its sections the user is, and only that project lists its
// sections beneath it, and after them the Custom Views this user saved on it.
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
        {projects.map((item) => {
          const params = { name: item.name }
          const open = Boolean(
            matchRoute({ to: "/projects/$name", params, fuzzy: true })
          )
          return (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton
                tooltip={item.project_name}
                isActive={open}
                render={<Link to="/projects/$name" params={params} />}
              >
                <FolderIcon />
                <span>{item.project_name}</span>
              </SidebarMenuButton>
              {open ? (
                <SidebarMenuSub>
                  {PROJECT_SECTIONS.map((section) => (
                    <SidebarMenuSubItem key={section.title}>
                      <SidebarMenuSubButton
                        isActive={Boolean(
                          matchRoute({
                            to: section.to,
                            params,
                            fuzzy: !section.exact,
                          }) ||
                          (section.detail &&
                            matchRoute({ to: section.detail, params }))
                        )}
                        render={<Link to={section.to} params={params} />}
                      >
                        {section.icon}
                        <span>{section.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                  <NavViews project={item.name} />
                </SidebarMenuSub>
              ) : null}
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
