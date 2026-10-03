import * as React from "react"
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import type { Milestone } from "@/lib/milestones"
import { useNuqsAdapter } from "@/lib/store/adapters/nuqs"
import { useFilterState } from "@/lib/store/hooks"
import { DataTableStoreProvider } from "@/lib/store/provider/DataTableStoreProvider"

import { milestoneColumns } from "./milestone-columns"
import {
  milestoneFilterFields,
  milestoneFilterSchema,
  type MilestoneFilterState,
} from "./milestone-filters"

/** The server's order (setu/api/milestone.py), when the URL names none. */
const DEFAULT_SORTING: SortingState = [{ id: "due_date", desc: false }]

// Paper: 06c — Milestone Created. Every milestone of the project is already
// loaded, so filtering, sorting and paging run in the browser; the filters
// and sort live in the URL through nuqs.
export function MilestoneTable({ milestones }: { milestones: Milestone[] }) {
  const adapter = useNuqsAdapter<MilestoneFilterState>(
    milestoneFilterSchema.definition,
    {
      id: "milestones",
      // Replace, not push: the table reads the URL once on mount, so Back
      // stepping through filter changes would leave the rows out of step.
      history: "replace",
    }
  )

  return (
    <DataTableStoreProvider adapter={adapter}>
      <MilestoneTableInner milestones={milestones} />
    </DataTableStoreProvider>
  )
}

// Split from the outer component so `useFilterState` runs inside the store
// provider and the first render already has the URL's filters (the
// outer/inner pattern from the data-table-filters nuqs docs).
function MilestoneTableInner({ milestones }: { milestones: Milestone[] }) {
  const urlState = useFilterState<MilestoneFilterState>()
  // Seeds only: after mount the table owns the state and writes it back.
  const [defaults] = React.useState(() => {
    const { sort, ...filters } = urlState
    const columnFilters: ColumnFiltersState = Object.entries(filters)
      .filter(([, value]) =>
        Array.isArray(value) ? value.length > 0 : value != null && value !== ""
      )
      .map(([id, value]) => ({ id, value }))
    return {
      columnFilters,
      sorting: sort ? [sort] : DEFAULT_SORTING,
    }
  })
  const filterFields = React.useMemo(
    () => milestoneFilterFields(milestones),
    [milestones]
  )

  return (
    <DataTable
      tableId="milestones"
      columns={milestoneColumns}
      data={milestones}
      filterFields={filterFields}
      defaultColumnFilters={defaults.columnFilters}
      defaultSorting={defaults.sorting}
      getRowId={getRowId}
      emptyMessage="No milestones match these filters."
      rowClassName="relative"
    />
  )
}

function getRowId(milestone: Milestone) {
  return milestone.name
}
