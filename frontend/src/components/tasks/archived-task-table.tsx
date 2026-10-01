import * as React from "react"
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import type { ArchivedTask } from "@/lib/tasks"
import { useNuqsAdapter } from "@/lib/store/adapters/nuqs"
import { useFilterState } from "@/lib/store/hooks"
import { DataTableStoreProvider } from "@/lib/store/provider/DataTableStoreProvider"

import { archivedTaskColumns } from "./archived-task-columns"
import {
  archivedTaskFilterFields,
  archivedTaskFilterSchema,
  type ArchivedTaskFilterState,
} from "./archived-task-filters"
import { useRestoreTask } from "./use-restore-task"

/** The server's order (setu.api.task.list_archived_tasks): newest first. */
const DEFAULT_SORTING: SortingState = [{ id: "archived_on", desc: true }]

// Paper: Task Archive 04. Every archived Task of the project is loaded, so
// filtering, sorting and paging run in the browser, as on the milestones
// table, with the filters and sort in the URL through nuqs.
export function ArchivedTaskTable({
  project,
  tasks,
}: {
  project: string
  tasks: ArchivedTask[]
}) {
  const adapter = useNuqsAdapter<ArchivedTaskFilterState>(
    archivedTaskFilterSchema.definition,
    { id: "archived-tasks", history: "replace" }
  )
  return (
    <DataTableStoreProvider adapter={adapter}>
      <ArchivedTaskTableInner project={project} tasks={tasks} />
    </DataTableStoreProvider>
  )
}

function ArchivedTaskTableInner({
  project,
  tasks,
}: {
  project: string
  tasks: ArchivedTask[]
}) {
  const urlState = useFilterState<ArchivedTaskFilterState>()
  // Seeds only: after mount the table owns the state and writes it back.
  const [defaults] = React.useState(() => {
    const { sort, ...filters } = urlState
    const columnFilters: ColumnFiltersState = Object.entries(filters)
      .filter(([, value]) =>
        Array.isArray(value) ? value.length > 0 : value != null && value !== ""
      )
      .map(([id, value]) => ({ id, value }))
    return { columnFilters, sorting: sort ? [sort] : DEFAULT_SORTING }
  })
  const restore = useRestoreTask(project)
  const columns = React.useMemo(() => archivedTaskColumns(restore), [restore])
  const filterFields = React.useMemo(
    () => archivedTaskFilterFields(tasks),
    [tasks]
  )

  return (
    <DataTable
      tableId="archived-tasks"
      columns={columns}
      data={tasks}
      filterFields={filterFields}
      defaultColumnFilters={defaults.columnFilters}
      defaultSorting={defaults.sorting}
      getRowId={getRowId}
      emptyMessage="No archived tasks match these filters."
    />
  )
}

function getRowId(task: ArchivedTask) {
  return task.name
}
