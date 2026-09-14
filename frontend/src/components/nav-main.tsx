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
import type { CommandId } from "@/lib/commands"

export interface NavItem {
  title: string
  to: LinkProps["to"]
  icon: React.ReactNode
  /** Navigation command whose binding is revealed while `G` is held. */
  command: CommandId
}

export function NavMain({ items }: { items: readonly NavItem[] }) {
  const matchRoute = useMatchRoute()
  // Holding the first key of the "G then …" sequences shows what follows.
  const revealHints = useKeyHold("G")
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={Boolean(matchRoute({ to: item.to }))}
              render={<Link to={item.to} />}
            >
              {item.icon}
              <span>{item.title}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge hidden={!revealHints}>
              <HotkeyHint command={item.command} />
            </SidebarMenuBadge>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
