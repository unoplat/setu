import { Link, useMatchRoute, type LinkProps } from "@tanstack/react-router"

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: readonly {
    title: string
    to: LinkProps["to"]
    icon: React.ReactNode
  }[]
}) {
  const matchRoute = useMatchRoute()
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
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
