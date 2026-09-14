import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { FolderIcon, SearchIcon } from "lucide-react"

import { HotkeyHint } from "@/components/hotkey-hint"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useCommandActions } from "@/lib/command-actions"
import {
  COMMAND_GROUPS,
  listCommands,
  useCommand,
  type CommandDefinition,
} from "@/lib/commands"
import { useProjects } from "@/lib/projects"

/**
 * Sidebar search row and the ⌘K palette. The palette lists every command
 * flagged `inPalette` in the registry plus the user's projects; shortcuts
 * shown next to items come from the bindings store, so they follow the
 * user's customisations.
 */
export function NavSearch() {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()
  const actions = useCommandActions()
  const { data: projects } = useProjects()

  useCommand("palette.open", () => setOpen((value) => !value))

  const groups = COMMAND_GROUPS.map((group) => ({
    group,
    commands: listCommands().filter(
      (command) => command.inPalette && command.group === group
    ),
  })).filter((entry) => entry.commands.length > 0)

  function run(command: CommandDefinition) {
    setOpen(false)
    actions[command.id]?.()
  }

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
          <HotkeyHint
            command="palette.open"
            className="ms-auto group-data-[collapsible=icon]:hidden **:data-[slot=kbd]:group-hover/menu-button:bg-background"
          />
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
              {projects?.length ? (
                <CommandGroup heading="Projects">
                  {projects.map((project) => (
                    <CommandItem
                      key={project.name}
                      value={`project ${project.project_name}`}
                      onSelect={() => {
                        setOpen(false)
                        void navigate({
                          to: "/projects/$name",
                          params: { name: project.name },
                        })
                      }}
                    >
                      <FolderIcon />
                      <span>{project.project_name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {groups.map(({ group, commands }) => (
                <CommandGroup key={group} heading={group}>
                  {commands.map((command) => (
                    <CommandItem
                      key={command.id}
                      value={`${command.title} ${command.description}`}
                      onSelect={() => run(command)}
                    >
                      <span>{command.title}</span>
                      <CommandShortcut>
                        <HotkeyHint command={command.id} />
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </CommandDialog>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
