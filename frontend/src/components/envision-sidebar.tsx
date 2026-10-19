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
import {
  useInboxCounts,
  useInboxEvents,
  useRevalidateInboxCounts,
} from "@/lib/inbox"
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

// Paper: 10c — Inbox. The Inbox item carries the count of records with
// anything unread, in every project; none at zero or while it loads.

/** The count as a pill, read out as "3 unread" rather than a bare number. */
function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-xs font-medium text-sidebar-primary-foreground tabular-nums">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{count} unread</span>
    </span>
  )
}

// The badge is hidden in the icon-collapsed sidebar, so the bell carries a dot
// there instead, while anything is unread.
const UNREAD_INBOX_ICON = (
  <span className="relative flex shrink-0">
    <BellIcon />
    <span
      aria-hidden="true"
      className="absolute -end-0.5 -top-0.5 hidden size-1.5 rounded-full bg-sidebar-primary group-data-[collapsible=icon]:block"
    />
  </span>
)

/** NAV with the Inbox's unread count; the other items as they are. */
function withUnread(unread: number): readonly NavItem[] {
  if (unread <= 0) return NAV
  return NAV.map((item) =>
    item.command === "nav.inbox"
      ? {
          ...item,
          icon: UNREAD_INBOX_ICON,
          badge: <UnreadBadge count={unread} />,
        }
      : item
  )
}

export function EnvisionSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { data: projects } = useProjects()
  const { data: counts } = useInboxCounts()
  const revalidateCounts = useRevalidateInboxCounts()
  // Mounted on every page, so the badge stays live wherever the user is.
  useInboxEvents(revalidateCounts)
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
        <NavMain items={withUnread(counts?.message.unread ?? 0)} />
        <NavProjects projects={projects ?? []} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
