import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  useQueryStates,
} from "nuqs"
import * as React from "react"

import type { TaskSummary } from "@/lib/tasks"

/**
 * The Board's Task filters (Paper: CV 01 — Filter the board). Each field holds
 * the values a Task may have, so a Task passes when it matches any value of
 * every field that has some. The same shape is what a Custom View saves
 * (setu/envision/doctype/envision_view, FILTER_FIELDS).
 */

export const TASK_FILTER_FIELDS = [
  "milestone",
  "priority",
  "assignee",
  "tag",
] as const

export type TaskFilterField = (typeof TASK_FILTER_FIELDS)[number]

export type TaskFilters = Readonly<Record<TaskFilterField, readonly string[]>>

export const NO_FILTERS: TaskFilters = {
  milestone: [],
  priority: [],
  assignee: [],
  tag: [],
}

/** Filters from anything stored or sent: known fields, distinct strings. */
export function toTaskFilters(input: unknown): TaskFilters {
  const source =
    input && typeof input === "object"
      ? (input as Partial<Record<string, unknown>>)
      : {}
  let any = false
  const filters = { ...NO_FILTERS }
  for (const field of TASK_FILTER_FIELDS) {
    const values = source[field]
    if (!Array.isArray(values)) continue
    const distinct = [
      ...new Set(
        values.filter((v): v is string => typeof v === "string" && v !== "")
      ),
    ]
    if (distinct.length) {
      filters[field] = distinct
      any = true
    }
  }
  return any ? filters : NO_FILTERS
}

export function hasFilters(filters: TaskFilters): boolean {
  return TASK_FILTER_FIELDS.some((field) => filters[field].length > 0)
}

/** Whether two sets of filters let the same Tasks through; order is nothing. */
export function sameFilters(a: TaskFilters, b: TaskFilters): boolean {
  return TASK_FILTER_FIELDS.every((field) => {
    if (a[field].length !== b[field].length) return false
    const values = new Set(a[field])
    return b[field].every((value) => values.has(value))
  })
}

/** Only the fields with values, as the server stores a view's filters. */
export function compactFilters(
  filters: TaskFilters
): Partial<Record<TaskFilterField, string[]>> {
  const compact: Partial<Record<TaskFilterField, string[]>> = {}
  for (const field of TASK_FILTER_FIELDS) {
    if (filters[field].length) compact[field] = [...filters[field]]
  }
  return compact
}

function parseList(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : []
  } catch {
    return []
  }
}

/** The Tasks the filters let through, in the order given. */
export function filterTasks(
  tasks: TaskSummary[],
  filters: TaskFilters
): TaskSummary[] {
  if (!hasFilters(filters)) return tasks
  const milestone = new Set(filters.milestone)
  const priority = new Set(filters.priority)
  const assignee = new Set(filters.assignee)
  const tag = new Set(filters.tag)
  return tasks.filter(
    (task) =>
      (milestone.size === 0 || milestone.has(task.envision_milestone ?? "")) &&
      (priority.size === 0 || priority.has(task.priority ?? "")) &&
      (assignee.size === 0 ||
        parseList(task._assign).some((user) => assignee.has(user))) &&
      (tag.size === 0 ||
        (task._user_tags ?? "").split(",").some((name) => tag.has(name)))
  )
}

// One URL key per field, values joined with commas ("priority=Urgent,High"),
// through nuqs and its TanStack Router adapter (routes/__root.tsx). `edited`
// marks a URL that holds changes to a saved view; see useBoardFilters.
const list = parseAsArrayOf(parseAsString)
const filterParsers = {
  milestone: list,
  priority: list,
  assignee: list,
  tag: list,
  edited: parseAsBoolean,
}

const CLEARED = {
  milestone: null,
  priority: null,
  assignee: null,
  tag: null,
  edited: null,
}

export interface BoardFilters {
  /** What the Board is filtered by right now. */
  filters: TaskFilters
  /**
   * On All tasks: whether anything is filtered. On a view: whether the
   * filters differ from the ones it saved (Paper: CV 05).
   */
  edited: boolean
  setFilters: (filters: TaskFilters) => void
  /** Back to no filters, or to the view as saved. */
  reset: () => void
}

/**
 * The Board's filters, kept in the URL so they survive a reload and the Back
 * button.
 *
 * - On All tasks (`saved` is null) the URL is the whole truth.
 * - On a view, a bare URL shows the view as saved. The first change writes
 *   every field to the URL with `edited`, so removing the last filter reads
 *   as "edited to nothing", not as "unchanged". Setting the filters back to
 *   the saved ones clears the URL again.
 */
export function useBoardFilters(saved: TaskFilters | null): BoardFilters {
  const [state, setState] = useQueryStates(filterParsers, {
    history: "replace",
  })
  const inUrl = React.useMemo(() => toTaskFilters(state), [state])
  const fromUrl = saved === null || state.edited === true
  const filters = fromUrl ? inUrl : saved
  const edited =
    saved === null ? hasFilters(inUrl) : !sameFilters(filters, saved)

  const setFilters = React.useCallback(
    (next: TaskFilters) => {
      if (saved !== null && sameFilters(next, saved)) {
        void setState(CLEARED)
        return
      }
      void setState({
        milestone: next.milestone.length ? [...next.milestone] : null,
        priority: next.priority.length ? [...next.priority] : null,
        assignee: next.assignee.length ? [...next.assignee] : null,
        tag: next.tag.length ? [...next.tag] : null,
        edited: saved === null ? null : true,
      })
    },
    [saved, setState]
  )
  const reset = React.useCallback(() => void setState(CLEARED), [setState])

  return { filters, edited, setFilters, reset }
}
