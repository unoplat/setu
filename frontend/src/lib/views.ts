import * as React from "react"
import { useFrappeGetCall } from "frappe-react-sdk"

import { toTaskFilters, type TaskFilters } from "@/lib/task-filters"

/**
 * A Project's Custom Views (CONTEXT.md): this user's saved Board filters,
 * private to them. Each one is an Envision View record (setu/api/view.py).
 */

export interface View {
  name: string
  view_name: string
  filters: TaskFilters
}

/** As the server sends it: only the filter fields that have values. */
export interface ViewRow {
  name: string
  view_name: string
  filters: unknown
}

/** Shared SWR key so a save, rename or delete revalidates every list. */
export function viewsKey(project: string) {
  return ["envision:views", project]
}

export function toView(row: ViewRow): View {
  return {
    name: row.name,
    view_name: row.view_name,
    filters: toTaskFilters(row.filters),
  }
}

export function useViews(project: string) {
  const { data, error, isLoading } = useFrappeGetCall<{ message: ViewRow[] }>(
    "setu.api.view.list_views",
    { project },
    viewsKey(project)
  )
  const views = React.useMemo(() => data?.message.map(toView), [data])
  return { views, error, isLoading }
}
