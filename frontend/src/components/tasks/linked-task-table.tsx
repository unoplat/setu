import * as React from "react"
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import { useDataTable } from "@/components/data-table/data-table-provider"
import type { DataTableFilterField } from "@/components/data-table/types"
import { useAssignees, type Assignee } from "@/lib/assignees"
import { useNuqsAdapter } from "@/lib/store/adapters/nuqs"
import { useFilterState } from "@/lib/store/hooks"
import { DataTableStoreProvider } from "@/lib/store/provider/DataTableStoreProvider"
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "@/lib/table/pagination"
import type { TaskSummary } from "@/lib/tasks"

import { linkedTaskColumns } from "./linked-task-columns"
import {
  linkedTaskFilterFields,
  linkedTaskFilterSchema,
  UNASSIGNED,
  type LinkedTask,
  type LinkedTaskFilterState,
} from "./linked-task-filters"

/** Paper 07f/06f: soonest due first, when the URL names no sort. */
const DEFAULT_SORTING: SortingState = [{ id: "due", desc: false }]

const NO_PEOPLE: Assignee[] = []

/**
 * Paper 07f "Module Detail: tasks table" and 06f "Milestone Detail: linked
 * tasks table". Every Task of the record is already loaded (useRelatedTasks),
 * so filtering, sorting and paging run in the browser; the filters, the sort
 * and the page live in the URL through nuqs.
 */
export function LinkedTaskTable({
  project,
  tasks,
}: {
  /** The Project's name (its id). */
  project: string
  tasks: TaskSummary[]
}) {
  const adapter = useNuqsAdapter<LinkedTaskFilterState>(
    linkedTaskFilterSchema.definition,
    {
      id: "linked-tasks",
      // Replace, not push: the table reads the URL once on mount, so Back
      // stepping through filter changes would leave the rows out of step.
      history: "replace",
    }
  )

  return (
    <DataTableStoreProvider adapter={adapter}>
      <LinkedTaskTableInner project={project} tasks={tasks} />
    </DataTableStoreProvider>
  )
}

// Split from the outer component so `useFilterState` runs inside the store
// provider and the first render already has the URL's state (the outer/inner
// pattern of milestone-table.tsx).
function LinkedTaskTableInner({
  project,
  tasks,
}: {
  project: string
  tasks: TaskSummary[]
}) {
  const urlState = useFilterState<LinkedTaskFilterState>()
  // Seeds only: after mount the table owns the state and writes it back.
  const [defaults] = React.useState(() => seedState(urlState))
  // The pickers' list, already loaded under a shared key; until it arrives a
  // row shows the assignee's id.
  const { data: assignees } = useAssignees()
  const people = React.useMemo(
    () =>
      new Map(
        (assignees?.message ?? NO_PEOPLE).map((person) => [person.name, person])
      ),
    [assignees]
  )
  const rows = React.useMemo(
    () => tasks.map((task) => toLinkedTask(task, project, people)),
    [tasks, project, people]
  )
  const filterFields = React.useMemo(
    () => linkedTaskFilterFields(rows, people),
    [rows, people]
  )

  return (
    <DataTable
      tableId="linked-tasks"
      columns={linkedTaskColumns}
      data={rows}
      filterFields={filterFields}
      defaultColumnFilters={defaults.columnFilters}
      defaultSorting={defaults.sorting}
      defaultPagination={defaults.pagination}
      syncPagination
      getRowId={getRowId}
      empty={<LinkedTasksNoMatch />}
      className="rounded-lg"
      rowClassName="relative h-13"
    />
  )
}

/** The table's starting state from what the URL holds. */
function seedState({ sort, page, size, ...filters }: LinkedTaskFilterState): {
  columnFilters: ColumnFiltersState
  sorting: SortingState
  pagination: PaginationState
} {
  const columnFilters: ColumnFiltersState = Object.entries(filters)
    .filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value != null && value !== ""
    )
    .map(([id, value]) => ({ id, value }))
  return {
    columnFilters,
    sorting: sort ? [sort] : DEFAULT_SORTING,
    pagination: {
      // A page past the end is clamped by the table once it has the rows.
      pageIndex: page != null && page > 1 ? page - 1 : 0,
      pageSize:
        size != null && PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
    },
  }
}

function toLinkedTask(
  task: TaskSummary,
  project: string,
  people: ReadonlyMap<string, Assignee>
): LinkedTask {
  const first = task.assignees[0]
  return {
    ...task,
    project,
    // Someone the picker leaves out (a disabled user) still shows, by id.
    assignee: first
      ? (people.get(first) ?? { name: first, full_name: "", user_image: null })
      : null,
  }
}

function getRowId(task: LinkedTask) {
  return task.name
}

/**
 * Paper 07g "Module tasks: no matches": what the filters are, how many Tasks
 * they hide, and Clear filters, which also empties the search and so returns
 * to the first page.
 */
function LinkedTasksNoMatch() {
  const { table, columnFilters, filterFields } = useDataTable<
    LinkedTask,
    unknown
  >()
  const hidden = table.getPreFilteredRowModel().rows.length

  return (
    <div className="flex flex-col items-center gap-1 py-10 text-center">
      <p className="text-sm font-medium text-foreground">
        {noMatchTitle(columnFilters, filterFields)}
      </p>
      <p className="text-compact text-muted-foreground">
        {hidden === 1
          ? "1 task is hidden by filters."
          : `${hidden} tasks are hidden by filters.`}{" "}
        <button
          type="button"
          className="font-medium text-sidebar-primary outline-none hover:underline focus-visible:underline"
          onClick={() => table.resetColumnFilters()}
        >
          Clear filters
        </button>
      </p>
    </div>
  )
}

/**
 * "No tasks match “refund” in Todo with Urgent priority assigned to Ada": the
 * search in curly quotes, then one phrase per checkbox filter, its values'
 * labels joined with "or".
 */
function noMatchTitle(
  columnFilters: ColumnFiltersState,
  filterFields: DataTableFilterField<LinkedTask>[]
): string {
  const search = columnFilters.find((filter) => filter.id === "subject")?.value
  const phrases = [
    phrase(columnFilters, filterFields, "status", (labels) => `in ${labels}`),
    phrase(
      columnFilters,
      filterFields,
      "priority",
      (labels) => `with ${labels} priority`
    ),
    phrase(
      columnFilters,
      filterFields,
      "assignee",
      (labels) => `assigned to ${labels}`
    ),
  ].filter((text): text is string => text !== null)

  if (typeof search === "string" && search !== "") {
    return ["No tasks match", `“${search}”`, ...phrases].join(" ")
  }
  if (phrases.length > 0) return ["No tasks", ...phrases].join(" ")
  return "No tasks match these filters."
}

/** One filter's phrase, or null when it filters nothing. */
function phrase(
  columnFilters: ColumnFiltersState,
  filterFields: DataTableFilterField<LinkedTask>[],
  id: "status" | "priority" | "assignee",
  wrap: (labels: string) => string
): string | null {
  const value = columnFilters.find((filter) => filter.id === id)?.value
  if (!Array.isArray(value) || value.length === 0) return null
  const options = filterFields.find((field) => field.value === id)?.options
  const labels = value.map((item: unknown) =>
    // "assigned to nobody", not "assigned to Unassigned".
    item === UNASSIGNED
      ? "nobody"
      : (options?.find((option) => option.value === item)?.label ??
        String(item))
  )
  return wrap(new Intl.ListFormat("en", { type: "disjunction" }).format(labels))
}
