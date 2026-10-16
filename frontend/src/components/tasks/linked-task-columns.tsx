import type { ColumnDef, SortFn } from "@tanstack/react-table"
import { parseISO } from "date-fns"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { AssigneeAvatar } from "@/components/milestones/assignee-avatar"
import { formatShortDay } from "@/lib/milestones"
import type { DataTableFeatures } from "@/lib/table/features"
import { BOARD_COLUMNS, boardColumnOf, TASK_PRIORITIES } from "@/lib/tasks"
import { cn } from "@/lib/utils"

import {
  LinkedTaskActions,
  LinkedTaskLink,
  PriorityLabel,
} from "./linked-task-cells"
import { UNASSIGNED, type LinkedTask } from "./linked-task-filters"
import { TaskStatusBadge } from "./task-status-badge"

/**
 * Paper 07f "Module Detail: tasks table" and 06f "Milestone Detail: linked
 * tasks table". Every column that can be filtered has the id of its key in
 * `linkedTaskFilterSchema`, which is also its URL key; `due` is only sorted.
 *
 * Filter functions are named, not "auto": TanStack Table v9 only resolves the
 * ones registered in lib/table/features.ts.
 */

const HEADER = "px-3 text-foreground"
const CELL = "px-3"

/** Board column order, Todo first, rather than the titles' alphabet. */
const byBoardColumn: SortFn<DataTableFeatures, LinkedTask> = (a, b, id) =>
  boardColumnRank(a.getValue(id)) - boardColumnRank(b.getValue(id))

function boardColumnRank(value: unknown): number {
  return BOARD_COLUMNS.findIndex((column) => column.id === value)
}

/** Low to Urgent; Tasks with no priority sort last (`sortUndefined`). */
const byPriority: SortFn<DataTableFeatures, LinkedTask> = (a, b, id) =>
  priorityRank(a.getValue(id)) - priorityRank(b.getValue(id))

function priorityRank(value: unknown): number {
  return TASK_PRIORITIES.findIndex((priority) => priority === value)
}

export const linkedTaskColumns: ColumnDef<DataTableFeatures, LinkedTask>[] = [
  {
    id: "subject",
    accessorKey: "subject",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Task" />
    ),
    cell: ({ row }) => (
      <LinkedTaskLink
        project={row.original.project}
        name={row.original.name}
        subject={row.original.subject}
      />
    ),
    sortFn: "text",
    filterFn: "includesString",
    enableHiding: false,
    meta: {
      label: "Task",
      headerClassName: HEADER,
      // `max-w-0` with `w-full`: the column takes what the fixed ones leave,
      // and the subject clamps to it instead of widening the table.
      cellClassName: "w-full max-w-0 px-3",
    },
  },
  {
    id: "status",
    accessorFn: (task) => boardColumnOf(task.status),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const column = boardColumnOf(row.original.status)
      return column ? (
        <TaskStatusBadge column={column} />
      ) : (
        <span className="text-muted-foreground">{row.original.status}</span>
      )
    },
    sortFn: byBoardColumn,
    sortUndefined: "last",
    filterFn: "arrSome",
    meta: {
      label: "Status",
      headerClassName: cn(HEADER, "w-28"),
      cellClassName: CELL,
    },
  },
  {
    id: "priority",
    accessorFn: (task) => task.priority ?? undefined,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Priority" />
    ),
    cell: ({ row }) => <PriorityLabel priority={row.original.priority} />,
    sortFn: byPriority,
    sortUndefined: "last",
    filterFn: "arrSome",
    meta: {
      label: "Priority",
      headerClassName: cn(HEADER, "w-21"),
      cellClassName: CELL,
    },
  },
  {
    id: "assignee",
    // Every assignee, so a filter on anyone finds the Task; the cell shows
    // the first.
    accessorFn: (task) =>
      task.assignees.length > 0 ? task.assignees : [UNASSIGNED],
    header: "Assignee",
    cell: ({ row }) => {
      const { assignee } = row.original
      if (!assignee) {
        return <span className="text-muted-foreground">Unassigned</span>
      }
      return (
        <span className="flex min-w-0 items-center gap-2">
          <AssigneeAvatar person={assignee} />
          <span className="truncate text-sm/5">
            {assignee.full_name || assignee.name}
          </span>
        </span>
      )
    },
    filterFn: "arrIncludesSome",
    enableSorting: false,
    meta: {
      label: "Assignee",
      headerClassName: cn(HEADER, "w-31"),
      cellClassName: cn(CELL, "max-w-31"),
    },
  },
  {
    id: "due",
    accessorFn: (task) =>
      task.exp_end_date ? parseISO(task.exp_end_date.slice(0, 10)) : undefined,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Due" />
    ),
    cell: ({ row }) => {
      const { exp_end_date, status } = row.original
      if (!exp_end_date) return <span className="text-muted-foreground">—</span>
      return (
        <span
          className={cn(
            "text-sm/5 whitespace-nowrap",
            status === "Overdue" && "text-destructive"
          )}
        >
          {formatShortDay(exp_end_date.slice(0, 10))}
        </span>
      )
    },
    sortFn: "datetime",
    // Last in both directions: a Task with no due date is never "soonest".
    sortUndefined: "last",
    enableColumnFilter: false,
    meta: {
      label: "Due",
      headerClassName: cn(HEADER, "w-16"),
      cellClassName: CELL,
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <LinkedTaskActions
        project={row.original.project}
        name={row.original.name}
        subject={row.original.subject}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableColumnFilter: false,
    meta: { headerClassName: "w-14 px-3", cellClassName: CELL },
  },
]
