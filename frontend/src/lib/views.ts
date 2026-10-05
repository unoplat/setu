import * as React from "react"
import { useFrappeGetCall } from "frappe-react-sdk"

import { toTaskFilters, type TaskFilters } from "@/lib/task-filters"

/**
 * Custom Views (CONTEXT.md): this user's saved Board filters, private to them,
 * on one Project's Board or, with no project, on My tasks (ADR 0004). Each one
 * is an Envision View record (setu/api/view.py).
 */

export interface View {
  name: string
  view_name: string
  /** The Project whose Board it filters; null for a My tasks view. */
  project: string | null
  filters: TaskFilters
}

/** As the server sends it: only the filter fields that have values. */
export interface ViewRow {
  name: string
  view_name: string
  project: string | null
  filters: unknown
}

/** Shared SWR key so a save, rename or delete revalidates every list. */
export function viewsKey(project: string | null) {
  return project === null ? ["envision:my-views"] : ["envision:views", project]
}

export function toView(row: ViewRow): View {
  return {
    name: row.name,
    view_name: row.view_name,
    project: row.project || null,
    filters: toTaskFilters(row.filters),
  }
}

/** A Project's views, or with no project the user's My tasks views. */
export function useViews(project: string | null) {
  const { data, error, isLoading } = useFrappeGetCall<{ message: ViewRow[] }>(
    "setu.api.view.list_views",
    project === null ? undefined : { project },
    viewsKey(project)
  )
  const views = React.useMemo(() => data?.message.map(toView), [data])
  return { views, error, isLoading }
}
