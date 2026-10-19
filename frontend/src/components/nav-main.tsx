import { Link, useMatchRoute, type LinkProps } from "@tanstack/react-router"
import { useKeyHold } from "@tanstack/react-hotkeys"

import { HotkeyHint } from "@/components/hotkey-hint"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  isScopeEnabled,
  useIsTyping,
  useScopeStack,
  type CommandId,
} from "@/lib/commands"

export interface NavItem {
  title: string
  to: LinkProps["to"]
  icon: React.ReactNode
  /** Navigation command whose binding is revealed while `G` is held. */
  command: CommandId
  /**
   * Shown beneath the item while the user is in it, as a Project's sections
   * are (nav-projects.tsx): My tasks' Views.
   */
  sub?: React.ReactNode
  /**
   * Shown at the item's end, in the slot the hotkey hint takes while `G` is
   * held: the Inbox's unread count. Hidden, with the slot, in the
   * icon-collapsed sidebar.
   */
  badge?: React.ReactNode
}

export function NavMain({ items }: { items: readonly NavItem[] }) {
  const matchRoute = useMatchRoute()
  // Holding the first key of the "G then …" sequences shows what follows.
  // `useKeyHold` reports the key wherever it is pressed, so the hints stay
  // hidden while the sequences themselves cannot fire: when typing a "g" into
  // a field, or under a modal scope.
  const holdingG = useKeyHold("G")
  const typing = useIsTyping()
  const globalEnabled = isScopeEnabled("global", useScopeStack())
  const revealHints = holdingG && !typing && globalEnabled
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => {
          // Fuzzy, so My tasks stays highlighted on one of its views.
          const open = Boolean(matchRoute({ to: item.to, fuzzy: true }))
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={open}
                render={<Link to={item.to} />}
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
              {/* The hint takes the slot while it is revealed; otherwise the
                  badge, if the item has one. */}
              <SidebarMenuBadge hidden={!revealHints && !item.badge}>
                {revealHints ? (
                  <HotkeyHint command={item.command} />
                ) : (
                  item.badge
                )}
              </SidebarMenuBadge>
              {open ? item.sub : null}
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
