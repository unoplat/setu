import { Link, useLinkProps, useNavigate } from "@tanstack/react-router"
import {
  EllipsisIcon,
  FlagIcon,
  LinkIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react"
import { toast } from "sonner"

import type { CheckboxOptionProps } from "@/components/data-table/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { isBoardColumnId, isTaskPriority, PRIORITY_CLASS } from "@/lib/tasks"
import { cn } from "@/lib/utils"

import { TaskStatusIcon } from "./task-status-badge"

/**
 * What the linked tasks table (Paper 07f, 06f) draws in its cells and in its
 * Status and Priority filter options, kept apart from the column and filter
 * definitions so those modules export no components.
 */

interface TaskRef {
  /** The Project's name (its id). */
  project: string
  /** The Task's id, TASK-2026-00010. */
  name: string
  subject: string
}

/**
 * The ID over the subject, opening the Task. A real link, so ⌘-click and the
 * keyboard work; its `::after` stretches over the row, which the table marks
 * `relative` (as milestone-link.tsx does).
 * https://tanstack.com/router/latest/docs/framework/react/guide/navigation
 */
export function LinkedTaskLink({ project, name, subject }: TaskRef) {
  return (
    <Link
      to="/projects/$name/tasks/$task"
      params={{ name: project, task: name }}
      className="flex min-w-0 flex-col outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
    >
      <span className="font-mono text-meta text-muted-foreground">{name}</span>
      <span className="line-clamp-1 text-sm/5 font-medium">{subject}</span>
    </Link>
  )
}

/** The flag in PRIORITY_CLASS's colour, then the name; Low's is quiet too. */
export function PriorityLabel({ priority }: { priority: string | null }) {
  if (!isTaskPriority(priority)) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span className="flex items-center gap-1.5">
      <FlagIcon className={cn("size-3 shrink-0", PRIORITY_CLASS[priority])} />
      <span
        className={cn(
          "text-compact",
          priority === "Low" && "text-muted-foreground"
        )}
      >
        {priority}
      </span>
    </span>
  )
}

/**
 * The row's ⋯ menu: open the Task, or copy its address. It sits above the
 * row's stretched link (`relative z-10`) so it gets its own clicks.
 * https://base-ui.com/react/components/menu
 */
export function LinkedTaskActions({ project, name, subject }: TaskRef) {
  const navigate = useNavigate()
  const params = { name: project, task: name }
  // The router's own href for the Task, basepath included.
  const { href } = useLinkProps({ to: "/projects/$name/tasks/$task", params })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative z-10"
            aria-label={`Actions for ${subject}`}
          />
        }
      >
        <EllipsisIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() =>
            void navigate({ to: "/projects/$name/tasks/$task", params })
          }
        >
          <SquareArrowOutUpRightIcon />
          Open task
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void copyLink(href)}>
          <LinkIcon />
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Copies the absolute address of `href`, as task-actions.tsx does. */
async function copyLink(href: string | undefined) {
  try {
    await navigator.clipboard.writeText(
      new URL(href ?? "", window.location.origin).href
    )
    toast.success("Link copied")
  } catch {
    toast.error("The link could not be copied.")
  }
}

/** A Status filter option: the column's icon, then its title (Paper 06g). */
export function StatusOption({ value, label }: CheckboxOptionProps) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {isBoardColumnId(value) ? <TaskStatusIcon column={value} /> : null}
      <span className="truncate">{label}</span>
    </span>
  )
}

/** A Priority filter option: its flag, coloured as the table's, then its name. */
export function PriorityOption({ value, label }: CheckboxOptionProps) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {isTaskPriority(value) ? (
        <FlagIcon className={cn("size-3 shrink-0", PRIORITY_CLASS[value])} />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  )
}
