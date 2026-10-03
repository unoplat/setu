import * as React from "react"
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import type { Module } from "@/lib/modules"
import { useNuqsAdapter } from "@/lib/store/adapters/nuqs"
import { useFilterState } from "@/lib/store/hooks"
import { DataTableStoreProvider } from "@/lib/store/provider/DataTableStoreProvider"

import { moduleColumns } from "./module-columns"
import {
  moduleFilterFields,
  moduleFilterSchema,
  type ModuleFilterState,
} from "./module-filters"

/** The server's order (setu/api/module.py), when the URL names none. */
const DEFAULT_SORTING: SortingState = [{ id: "module_name", desc: false }]

// Paper: 07c — Module Created. Every module of the project is already loaded,
// so filtering, sorting and paging run in the browser; the filters and sort
// live in the URL through nuqs, as on the milestones table.
export function ModuleTable({
  modules,
  created,
}: {
  modules: Module[]
  /** The module just created on this page, badged "New". */
  created: string | null
}) {
  const adapter = useNuqsAdapter<ModuleFilterState>(
    moduleFilterSchema.definition,
    {
      id: "modules",
      // Replace, not push: the table reads the URL once on mount, so Back
      // stepping through filter changes would leave the rows out of step.
      history: "replace",
    }
  )

  return (
    <DataTableStoreProvider adapter={adapter}>
      <ModuleTableInner modules={modules} created={created} />
    </DataTableStoreProvider>
  )
}

// Split from the outer component so `useFilterState` runs inside the store
// provider and the first render already has the URL's filters.
function ModuleTableInner({
  modules,
  created,
}: {
  modules: Module[]
  created: string | null
}) {
  const urlState = useFilterState<ModuleFilterState>()
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
  const columns = React.useMemo(() => moduleColumns(created), [created])
  const filterFields = React.useMemo(
    () => moduleFilterFields(modules),
    [modules]
  )

  return (
    <DataTable
      tableId="modules"
      columns={columns}
      data={modules}
      filterFields={filterFields}
      defaultColumnFilters={defaults.columnFilters}
      defaultSorting={defaults.sorting}
      getRowId={getRowId}
      emptyMessage="No modules match these filters."
      rowClassName="relative"
    />
  )
}

function getRowId(module: Module) {
  return module.name
}
