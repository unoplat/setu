import type { ColumnDef } from "@tanstack/react-table"
import { LayoutGridIcon } from "lucide-react"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { AssigneeAvatar } from "@/components/milestones/assignee-avatar"
import type { Module } from "@/lib/modules"
import type { DataTableFeatures } from "@/lib/table/features"

import { ModuleLink } from "./module-link"
import { NO_LEAD } from "./module-filters"

/**
 * Paper: 07c — Module Created. Every column that can be filtered has the id
 * of its key in `moduleFilterSchema`, which is also its URL key. Filter
 * functions are named, not "auto": TanStack Table v9 only resolves the ones
 * registered in lib/table/features.ts.
 *
 * `created` is the module this visit just made, which wears 07c's "New"
 * badge until the page is left.
 */
export function moduleColumns(
  created: string | null
): ColumnDef<DataTableFeatures, Module>[] {
  return [
    {
      id: "module_name",
      accessorKey: "module_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Module" />
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          {row.original.name === created ? (
            <span className="flex h-5.5 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium">
              <LayoutGridIcon className="size-3 text-sidebar-primary" />
              New
            </span>
          ) : null}
          <ModuleLink module={row.original} />
        </span>
      ),
      filterFn: "includesString",
      enableHiding: false,
      meta: { label: "Module" },
    },
    {
      id: "summary",
      accessorKey: "summary",
      header: "Summary",
      cell: ({ row }) =>
        row.original.summary ? (
          <span className="line-clamp-1 max-w-160 text-muted-foreground">
            {row.original.summary}
          </span>
        ) : (
          <span className="text-muted-foreground/70">No description</span>
        ),
      enableSorting: false,
      meta: { label: "Summary" },
    },
    {
      id: "lead",
      accessorFn: (module) => module.lead?.name ?? NO_LEAD,
      header: "Lead",
      cell: ({ row }) => {
        const { lead } = row.original
        if (!lead) {
          return <span className="text-muted-foreground">No lead</span>
        }
        return (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <AssigneeAvatar person={lead} />
            {lead.full_name || lead.name}
          </span>
        )
      },
      filterFn: "arrSome",
      enableSorting: false,
      meta: { label: "Lead" },
    },
  ]
}
