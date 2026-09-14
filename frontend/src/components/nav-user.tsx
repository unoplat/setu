import { Link, useRouter } from "@tanstack/react-router"
import { useFrappeAuth, useFrappeGetDoc } from "frappe-react-sdk"
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

/** Signed-in Frappe identity. The Envision role label needs membership, which does not exist yet. */
export function NavUser() {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const { currentUser, logout } = useFrappeAuth()
  const { data: user } = useFrappeGetDoc<{ full_name?: string }>(
    "User",
    currentUser ?? undefined
  )
  const name = user?.full_name ?? currentUser ?? ""
  const email = currentUser ?? ""
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  async function handleLogout() {
    await logout()
    // Re-run route guards with the signed-out context so they redirect to login.
    await router.invalidate()
  }

  const identity = (
    <>
      <Avatar>
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-start text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs">{email}</span>
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            {identity}
            <ChevronsUpDownIcon className="ms-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                  {identity}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/settings" />}>
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
