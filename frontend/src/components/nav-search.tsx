import { SearchIcon } from "lucide-react"

import { HotkeyHint } from "@/components/hotkey-hint"
import { openPalette } from "@/components/search/store"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/**
 * Sidebar search row (Paper: search-experience, A). It opens the one search
 * palette the app shell mounts (components/search/search-palette.tsx).
 */
export function NavSearch() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          variant="outline"
          tooltip="Search"
          aria-haspopup="dialog"
          onClick={openPalette}
          className="text-muted-foreground"
        >
          <SearchIcon />
          <span className="truncate">Search</span>
          {/* Kbd defaults to bg-muted, which equals the button's hover colour. */}
          <HotkeyHint
            command="palette.open"
            className="ms-auto group-data-[collapsible=icon]:hidden **:data-[slot=kbd]:group-hover/menu-button:bg-background"
          />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
