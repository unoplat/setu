import * as React from "react"
import { useNavigate, type LinkProps } from "@tanstack/react-router"
import { SearchIcon } from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/** Sidebar search row that opens the command palette (also on ⌘K / Ctrl+K). */
export function NavSearch({
  items,
}: {
  items: readonly {
    title: string
    to: LinkProps["to"]
    icon: React.ReactNode
  }[]
}) {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          variant="outline"
          tooltip="Search"
          onClick={() => setOpen(true)}
          className="text-muted-foreground"
        >
          <SearchIcon />
          <span className="truncate">Search</span>
          {/* Kbd defaults to bg-muted, which equals the button's hover colour. */}
          <KbdGroup className="ms-auto group-data-[collapsible=icon]:hidden">
            <Kbd className="group-hover/menu-button:bg-background">⌘</Kbd>
            <Kbd className="group-hover/menu-button:bg-background">K</Kbd>
          </KbdGroup>
        </SidebarMenuButton>
        <CommandDialog
          open={open}
          onOpenChange={setOpen}
          title="Search"
          description="Search projects and actions"
        >
          <Command>
            <CommandInput placeholder="Search projects & actions…" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Go to">
                {items.map((item) => (
                  <CommandItem
                    key={item.title}
                    onSelect={() => {
                      setOpen(false)
                      void navigate({ to: item.to })
                    }}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
