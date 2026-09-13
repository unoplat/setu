import { Link, useMatchRoute } from "@tanstack/react-router"
import { useFrappeAuth, useFrappeGetDoc } from "frappe-react-sdk"
import {
  BellIcon,
  ChevronDownIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SquareCheckIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Paper: "Projects Sidebar — Empty" (00 — Empty Projects).
// Global navigation is My tasks, Inbox, Settings; Projects lists
// Envision-enabled Projects (empty until the enablement flag exists).

const NAV = [
  { title: "My tasks", to: "/my-tasks", icon: SquareCheckIcon },
  { title: "Inbox", to: "/inbox", icon: BellIcon },
  { title: "Settings", to: "/settings", icon: SettingsIcon },
] as const

export function EnvisionSidebar() {
  const matchRoute = useMatchRoute()
  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center gap-3 px-1">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            E
          </div>
          <div className="grid leading-tight">
            <span className="text-sm font-semibold">Envision</span>
            <span className="text-xs text-muted-foreground">Project work</span>
          </div>
        </div>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-full bg-sidebar-accent px-3 text-sm text-muted-foreground"
        >
          <SearchIcon className="size-4" />
          <span className="flex-1 text-left">Search projects &amp; actions</span>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  render={<Link to={item.to} />}
                  isActive={Boolean(matchRoute({ to: item.to }))}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction title="New project">
            <PlusIcon />
          </SidebarGroupAction>
          {/* Envision-enabled Projects render here once the flag exists. */}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-3">
        <IdentityFooter />
      </SidebarFooter>
    </Sidebar>
  )
}

/** Signed-in Frappe identity. The Envision role label needs membership, which does not exist yet. */
function IdentityFooter() {
  const { currentUser } = useFrappeAuth()
  const { data: user } = useFrappeGetDoc<{ full_name?: string }>(
    "User",
    currentUser ?? undefined
  )
  const fullName = user?.full_name ?? currentUser ?? ""
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{fullName}</span>
        <span className="truncate text-xs text-muted-foreground">Signed in</span>
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground" />
    </div>
  )
}
