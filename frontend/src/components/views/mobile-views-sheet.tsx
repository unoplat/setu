import { useNavigate } from "@tanstack/react-router"
import {
  CheckIcon,
  EllipsisIcon,
  LockIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { openDeleteView, openRenameView } from "@/components/views/store"
import {
  setViewsSheetOpen,
  useViewsSheetOpen,
} from "@/components/views/views-sheet-store"
import { cn } from "@/lib/utils"
import { TASK_FILTER_FIELDS, type TaskFilterField } from "@/lib/task-filters"
import type { View } from "@/lib/views"

const FIELD_LABELS: Record<TaskFilterField, string> = {
  project: "Project",
  milestone: "Milestone",
  priority: "Priority",
  assignee: "Assignee",
  tag: "Tag",
}

/** One line of what a view filters by, e.g. "Priority Urgent, High · Tag bug". */
function summary(view: View): string {
  const parts = TASK_FILTER_FIELDS.filter(
    (field) => view.filters[field].length > 0
  ).map((field) => `${FIELD_LABELS[field]} ${view.filters[field].join(", ")}`)
  return parts.length ? parts.join(" · ") : "No filters"
}

// Paper: "Saved views · 2 Tap My tasks tab → sheet". On a phone the Board's
// saved views open in a bottom sheet, from the header's title or a second tap
// on the My tasks tab. It only switches views: saving stays in View & filter.
export function MobileViewsSheet({
  project,
  views,
  current,
  edited,
}: {
  /** The Project whose Board it is; null on My tasks. */
  project: string | null
  views: readonly View[]
  /** The open view; null on All tasks. */
  current: View | null
  /** Whether the open view's filters differ from the ones it saved. */
  edited: boolean
}) {
  const open = useViewsSheetOpen()
  const navigate = useNavigate()
  const all = project === null ? "All my tasks" : "All tasks"
  const label = project === null ? "My tasks views" : "Views"

  function go(view: View | null) {
    setViewsSheetOpen(false)
    if (project === null) {
      void (view
        ? navigate({ to: "/my-tasks/views/$view", params: { view: view.name } })
        : navigate({ to: "/my-tasks" }))
      return
    }
    void (view
      ? navigate({
          to: "/projects/$name/views/$view",
          params: { name: project, view: view.name },
        })
      : navigate({ to: "/projects/$name", params: { name: project } }))
  }

  return (
    <Drawer open={open} onOpenChange={setViewsSheetOpen}>
      <DrawerContent className="md:hidden">
        <DrawerHeader>
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle>{label}</DrawerTitle>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <LockIcon className="size-3" />
              Private to you
            </span>
          </div>
        </DrawerHeader>
        <ul className="flex flex-col gap-0.5 overflow-y-auto px-2">
          <ViewRow
            name={all}
            meta={project === null ? "Default · every project" : "Default"}
            active={current === null}
            onSelect={() => go(null)}
          />
          {views.map((view) => (
            <ViewRow
              key={view.name}
              name={view.view_name}
              meta={summary(view)}
              active={current?.name === view.name}
              edited={current?.name === view.name && edited}
              onSelect={() => go(view)}
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Actions for ${view.view_name}`}
                    render={<Button variant="ghost" size="icon-touch" />}
                  >
                    <EllipsisIcon className="text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() => {
                        setViewsSheetOpen(false)
                        openRenameView({ project, view })
                      }}
                    >
                      <PencilIcon />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setViewsSheetOpen(false)
                        openDeleteView({ project, view })
                      }}
                    >
                      <Trash2Icon />
                      Delete view…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))}
        </ul>
        <div className="px-5 pt-3 pb-6">
          <DrawerDescription>
            {current && edited
              ? "Unsaved filter changes. Save them from Filter at the top right."
              : "To save or update a view, use Filter at the top right."}
          </DrawerDescription>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function ViewRow({
  name,
  meta,
  active,
  edited = false,
  onSelect,
  actions,
}: {
  name: string
  meta: string
  active: boolean
  edited?: boolean
  onSelect: () => void
  actions?: React.ReactNode
}) {
  return (
    <li
      className={cn(
        "flex min-h-14 items-center rounded-xl pe-1",
        active && "bg-muted"
      )}
    >
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 ps-3 text-start outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex w-5 shrink-0 justify-center">
          {active ? (
            <CheckIcon className="size-4.5 text-sidebar-primary" />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-subtitle font-semibold text-foreground">
              {name}
            </span>
            {edited ? (
              <span className="shrink-0 text-meta font-semibold text-sidebar-primary">
                · Edited
              </span>
            ) : null}
          </span>
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
        </span>
      </button>
      {actions ?? <span className="size-11 shrink-0" />}
    </li>
  )
}
