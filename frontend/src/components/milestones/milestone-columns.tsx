import type { ColumnDef } from "@tanstack/react-table"
import { parseISO } from "date-fns"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { Badge } from "@/components/ui/badge"
import { formatDateRange, type Milestone } from "@/lib/milestones"
import type { DataTableFeatures } from "@/lib/table/features"

import { AssigneeAvatar } from "./assignee-avatar"
import { MilestoneLink } from "./milestone-link"
import {
  PROGRESS_LABELS,
  progressBucket,
  UNASSIGNED,
} from "./milestone-filters"

/**
 * Paper: 06c — Milestone Created. Every column that can be filtered has the id
 * of its key in `milestoneFilterSchema`, which is also its URL key.
 *
 * Filter functions are named, not "auto": TanStack Table v9 only resolves the
 * ones registered in lib/table/features.ts, and these values are not what
 * "auto" would guess (a Date, a bucket string, a user id).
 */
export const milestoneColumns: ColumnDef<DataTableFeatures, Milestone>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Milestone" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.name}
      </span>
    ),
    meta: { label: "Milestone" },
  },
  {
    id: "subject",
    accessorKey: "subject",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ row }) => <MilestoneLink milestone={row.original} />,
    filterFn: "includesString",
    enableHiding: false,
    meta: { label: "Title" },
  },
  {
    id: "due_date",
    // Local midnight, the same instant the date filter's calendar picks, so a
    // range that ends on the due day includes it.
    accessorFn: (milestone) =>
      milestone.due_date ? parseISO(milestone.due_date) : undefined,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dates" />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {formatDateRange(row.original.start_date, row.original.due_date)}
      </span>
    ),
    sortFn: "datetime",
    sortUndefined: "last",
    filterFn: "inDateRange",
    meta: { label: "Due date" },
  },
  {
    id: "assignee",
    accessorFn: (milestone) => milestone.assignee?.name ?? UNASSIGNED,
    header: "Assignee",
    cell: ({ row }) => {
      const { assignee } = row.original
      if (!assignee) {
        return <span className="text-muted-foreground">Unassigned</span>
      }
      return (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <AssigneeAvatar person={assignee} />
          {assignee.full_name || assignee.name}
        </span>
      )
    },
    filterFn: "arrSome",
    enableSorting: false,
    meta: { label: "Assignee" },
  },
  {
    id: "progress",
    // Filtered by bucket (the checkbox options), sorted by the percentage.
    accessorFn: (milestone) => progressBucket(milestone.progress),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Progress" />
    ),
    cell: ({ row }) => {
      const { progress } = row.original
      const bucket = progressBucket(progress)
      return (
        <Badge variant="outline">
          {bucket === "in_progress"
            ? `${Math.round(progress)}%`
            : PROGRESS_LABELS[bucket]}
        </Badge>
      )
    },
    sortFn: (a, b) => a.original.progress - b.original.progress,
    filterFn: "arrSome",
    meta: { label: "Progress" },
  },
]
