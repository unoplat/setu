import type { ColumnDef } from "@tanstack/react-table"
import {
  differenceInCalendarDays,
  differenceInMinutes,
  isToday,
  parseISO,
} from "date-fns"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { plural } from "@/lib/confirm-count"
import { formatShortDay } from "@/lib/milestones"
import { statusTitle, type ArchivedTask } from "@/lib/tasks"
import type { DataTableFeatures } from "@/lib/table/features"
import { cn } from "@/lib/utils"

import { RestoreButton } from "./restore-button"

/** Days left at or under which "Deleted in" turns red. */
const SOON_DAYS = 3

/**
 * Paper: Task Archive 04. The Task, its Status, when and by whom it was
 * archived, how long until it is deleted for good, and Restore.
 */
export function archivedTaskColumns(
  restore: (task: ArchivedTask) => Promise<boolean>
): ColumnDef<DataTableFeatures, ArchivedTask>[] {
  return [
    {
      id: "subject",
      accessorKey: "subject",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Task" />
      ),
      cell: ({ row }) => {
        const task = row.original
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-medium">{task.subject}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {task.name}
              </span>
            </span>
            {task.subtasks ? (
              <span className="text-xs text-muted-foreground">
                + {plural(task.subtasks, "subtask")}
              </span>
            ) : null}
          </div>
        )
      },
      filterFn: "includesString",
      enableHiding: false,
      meta: { label: "Task" },
    },
    {
      id: "status",
      accessorFn: (task) => statusTitle(task.status),
      header: "Status",
      enableSorting: false,
      meta: { label: "Status" },
    },
    {
      id: "archived_on",
      accessorFn: (task) => parseISO(task.archived_on),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Archived" />
      ),
      cell: ({ row }) => {
        const { archived_on, archived_by } = row.original
        return (
          <div className="flex flex-col gap-0.5 whitespace-nowrap">
            <span>{archivedWhen(archived_on)}</span>
            {archived_by ? (
              <span className="text-xs text-muted-foreground">
                by {archived_by.full_name || archived_by.name}
              </span>
            ) : null}
          </div>
        )
      },
      sortFn: "datetime",
      enableHiding: false,
      meta: { label: "Archived" },
    },
    {
      // Filtered by who archived it; the Archived column shows the name.
      id: "archived_by",
      accessorFn: (task) => task.archived_by?.name ?? "",
      header: "Archived by",
      filterFn: "arrSome",
      enableSorting: false,
      meta: { label: "Archived by" },
    },
    {
      id: "deletes_on",
      accessorFn: (task) => parseISO(task.deletes_on),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Deleted in" />
      ),
      cell: ({ row }) => {
        const days = Math.max(
          0,
          differenceInCalendarDays(
            parseISO(row.original.deletes_on),
            new Date()
          )
        )
        return (
          <span
            className={cn(
              "whitespace-nowrap",
              days <= SOON_DAYS ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {days === 0 ? "Today" : plural(days, "day")}
          </span>
        )
      },
      sortFn: "datetime",
      meta: { label: "Deleted in" },
    },
    {
      id: "restore",
      header: () => <span className="sr-only">Restore</span>,
      cell: ({ row }) => (
        <RestoreButton task={row.original} restore={restore} />
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ]
}

/** "Just now", "Today", "Apr 1". */
function archivedWhen(value: string): string {
  const date = parseISO(value)
  if (differenceInMinutes(new Date(), date) < 1) return "Just now"
  if (isToday(date)) return "Today"
  return formatShortDay(value)
}
