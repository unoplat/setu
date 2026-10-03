import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { BookmarkIcon, ChevronDownIcon, KanbanIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { View } from "@/lib/views"

// Paper: CV 04 — Switch views. The Board's first control names what is open,
// All tasks or a view, and lists the others. Views are made from the Board
// itself (set filters, then Save view), which the footer says.
export function ViewSwitcher({
  project,
  views,
  current,
}: {
  project: string
  views: readonly View[]
  current: View | null
}) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)

  function go(view: View | null) {
    setOpen(false)
    void (view
      ? navigate({
          to: "/projects/$name/views/$view",
          params: { name: project, view: view.name },
        })
      : navigate({ to: "/projects/$name", params: { name: project } }))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" className="max-w-64" />}
      >
        <span className="truncate">{current?.view_name ?? "All tasks"}</span>
        <ChevronDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-70 gap-0 p-0">
        <Command>
          <CommandInput placeholder="Find a view…" />
          <CommandList>
            <CommandEmpty>No view by that name.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="All tasks"
                data-checked={current === null}
                onSelect={() => go(null)}
              >
                <KanbanIcon />
                All tasks
              </CommandItem>
            </CommandGroup>
            {views.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Your views">
                  {views.map((view) => (
                    <CommandItem
                      key={view.name}
                      // The id keeps two lookalike names apart for cmdk.
                      value={`${view.view_name} ${view.name}`}
                      data-checked={current?.name === view.name}
                      onSelect={() => go(view)}
                    >
                      <BookmarkIcon />
                      <span className="truncate">{view.view_name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Set filters, then Save view
        </p>
      </PopoverContent>
    </Popover>
  )
}
