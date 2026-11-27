import { Link, useMatchRoute } from "@tanstack/react-router"
import { BellIcon, FolderIcon, SearchIcon, SquareCheckIcon } from "lucide-react"

import { openPalette } from "@/components/search/store"
import {
  BottomNav,
  BottomNavBadge,
  BottomNavButton,
  BottomNavItem,
  BottomNavList,
} from "@/components/ui/bottom-nav"
import { UnreadBadge } from "@/components/unread-badge"
import { openViewsSheet } from "@/components/views/views-sheet-store"
import { useInboxCounts } from "@/lib/inbox"

/**
 * The phone's tab bar: Projects, My tasks, Inbox and Search, under every
 * shell screen below `md` except a task's page (its comment box takes the
 * bottom edge). On wider screens the sidebar does this job.
 *
 * - Hidden with CSS, not useIsMobile(), so it is there from the first paint.
 * - While it is rendered, index.css sets `--tab-bar-h` on the shell, which
 *   pads the content and shortens the boards so nothing ends up under it.
 * - Projects stays lit inside a project; My tasks on its Views. Search opens
 *   the search palette, so it is a button, never the current page.
 * - On My tasks, a second tap on My tasks opens its saved views sheet
 *   (Paper: "Saved views · 2 Tap My tasks tab → sheet").
 */
export function MobileTabBar() {
  const matchRoute = useMatchRoute()
  const { data: counts } = useInboxCounts()
  const unread = counts?.message.unread ?? 0

  if (matchRoute({ to: "/projects/$name/tasks/$task" })) return null

  const inMyTasks = Boolean(matchRoute({ to: "/my-tasks", fuzzy: true }))

  const inProjects = Boolean(
    matchRoute({ to: "/" }) ||
    matchRoute({ to: "/projects/$name", fuzzy: true })
  )

  return (
    <BottomNav aria-label="Main" className="md:hidden">
      <BottomNavList>
        <BottomNavItem>
          <BottomNavButton
            isActive={inProjects}
            // "/" would match every page fuzzily, so the Link only marks
            // itself on "/"; inside a project the tab is marked here.
            aria-current={inProjects ? "page" : undefined}
            render={<Link to="/" activeOptions={{ exact: true }} />}
          >
            <FolderIcon />
            <span>Projects</span>
          </BottomNavButton>
        </BottomNavItem>
        <BottomNavItem>
          {/* Link's default fuzzy match keeps My tasks lit on its Views. */}
          <BottomNavButton
            aria-haspopup={inMyTasks ? "dialog" : undefined}
            onClick={(event: React.MouseEvent) => {
              if (!inMyTasks) return
              event.preventDefault()
              openViewsSheet()
            }}
            render={<Link to="/my-tasks" />}
          >
            <SquareCheckIcon />
            <span>My tasks</span>
          </BottomNavButton>
        </BottomNavItem>
        <BottomNavItem>
          <BottomNavButton render={<Link to="/inbox" />}>
            <BellIcon />
            <span>Inbox</span>
            {unread > 0 ? (
              <BottomNavBadge>
                <UnreadBadge count={unread} />
              </BottomNavBadge>
            ) : null}
          </BottomNavButton>
        </BottomNavItem>
        <BottomNavItem>
          <BottomNavButton
            type="button"
            aria-haspopup="dialog"
            onClick={openPalette}
          >
            <SearchIcon />
            <span>Search</span>
          </BottomNavButton>
        </BottomNavItem>
      </BottomNavList>
    </BottomNav>
  )
}
