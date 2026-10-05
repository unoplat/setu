import { Link, useMatchRoute } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  EllipsisIcon,
  PencilIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import { parseAsBoolean, useQueryState } from "nuqs"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { openDeleteView, openRenameView } from "@/components/views/store"
import { useViews, type View } from "@/lib/views"

// Paper: "Custom view journey", the sidebar's Views section (CV 03, CV 06).
// The open Project lists this user's views under its sections; each one opens
// the Board behind its filters and has a ⋯ menu to rename or delete it. A
// Project with no views yet shows no section: views are made from the Board
// (set filters, then Save view).
//
// Paper: My Tasks 06 and 07. My tasks (no project) lists its own views the
// same way, under its nav item.
export function NavViews({ project }: { project: string | null }) {
  const { views } = useViews(project)
  if (!views?.length) return null
  return (
    <SidebarMenuSubItem>
      <Collapsible defaultOpen>
        <CollapsibleTrigger
          render={
            <SidebarMenuSubButton
              render={<button type="button" />}
              className="group/views w-full"
            />
          }
        >
          <SlidersHorizontalIcon />
          <span className="flex-1 text-start">Views</span>
          <ChevronDownIcon className="ms-auto text-muted-foreground! transition-transform group-data-panel-open/views:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="flex flex-col gap-0.5 ps-5 pt-1">
            {views.map((view) => (
              <NavView key={view.name} project={project} view={view} />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuSubItem>
  )
}

/** My tasks' views, nested under its nav item; nothing until there is one. */
export function NavMyTasksViews() {
  const { views } = useViews(null)
  if (!views?.length) return null
  return (
    <SidebarMenuSub>
      <NavViews project={null} />
    </SidebarMenuSub>
  )
}

function NavView({ project, view }: { project: string | null; view: View }) {
  const matchRoute = useMatchRoute()
  const active = Boolean(
    project === null
      ? matchRoute({
          to: "/my-tasks/views/$view",
          params: { view: view.name },
        })
      : matchRoute({
          to: "/projects/$name/views/$view",
          params: { name: project, view: view.name },
        })
  )
  // The Board marks a URL that holds unsaved changes to the open view
  // (lib/task-filters.ts); the dot says so here too (Paper: CV 05).
  const [edited] = useQueryState("edited", parseAsBoolean)

  return (
    <li className="group/view relative">
      <SidebarMenuSubButton
        size="sm"
        isActive={active}
        className="pe-8"
        render={
          project === null ? (
            <Link to="/my-tasks/views/$view" params={{ view: view.name }} />
          ) : (
            <Link
              to="/projects/$name/views/$view"
              params={{ name: project, view: view.name }}
            />
          )
        }
      >
        <span>{view.view_name}</span>
      </SidebarMenuSubButton>
      {active && edited ? (
        <span
          role="img"
          aria-label="Unsaved changes"
          className="pointer-events-none absolute end-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-sidebar-primary group-focus-within/view:hidden group-hover/view:hidden"
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${view.view_name}`}
          className="absolute end-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-hidden group-focus-within/view:opacity-100 group-hover/view:opacity-100 hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:opacity-100"
        >
          <EllipsisIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => openRenameView({ project, view })}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => openDeleteView({ project, view })}
          >
            <Trash2Icon />
            Delete view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
