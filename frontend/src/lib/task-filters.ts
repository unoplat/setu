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
  "project",
  "milestone",
  "priority",
  "assignee",
  "tag",
] as const

export type TaskFilterField = (typeof TASK_FILTER_FIELDS)[number]

export type TaskFilters = Readonly<Record<TaskFilterField, readonly string[]>>

export const NO_FILTERS: TaskFilters = {
  project: [],
  milestone: [],
  priority: [],
  assignee: [],
  tag: [],
}

/**
 * The fields a Board filters by, in the Filter menu's order (ADR 0004). A
 * Project's Board already shows one Project, so it has no Project field; My
 * tasks always shows the user's own Tasks, so it has no Assignee field.
 */
export const PROJECT_BOARD_FIELDS: readonly TaskFilterField[] = [
  "milestone",
  "priority",
  "assignee",
  "tag",
]

export const MY_TASKS_FIELDS: readonly TaskFilterField[] = [
  "project",
  "milestone",
  "priority",
  "tag",
]

/** A Project's Board, or with no project My tasks. */
export function boardFilterFields(
  project: string | null
): readonly TaskFilterField[] {
  return project === null ? MY_TASKS_FIELDS : PROJECT_BOARD_FIELDS
}

/**
 * The filters with every field but `fields` emptied, so a URL written by hand
 * cannot filter a Board, or reach a saved view, by a field it has not got.
 */
export function onlyFields(
  filters: TaskFilters,
  fields: readonly TaskFilterField[]
): TaskFilters {
  if (TASK_FILTER_FIELDS.every((f) => fields.includes(f) || !filters[f].length))
    return filters
  const kept = { ...NO_FILTERS }
  for (const field of fields) kept[field] = filters[field]
  return hasFilters(kept) ? kept : NO_FILTERS
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

/**
 * The Tasks the filters let through, in the order given. Only My tasks lists
 * Tasks with their Project, and only it filters by one.
 */
export function filterTasks<
  T extends TaskSummary & { project?: string | null },
>(tasks: T[], filters: TaskFilters): T[] {
  if (!hasFilters(filters)) return tasks
  const project = new Set(filters.project)
  const milestone = new Set(filters.milestone)
  const priority = new Set(filters.priority)
  const assignee = new Set(filters.assignee)
  const tag = new Set(filters.tag)
  return tasks.filter(
    (task) =>
      (project.size === 0 || project.has(task.project ?? "")) &&
      (milestone.size === 0 || milestone.has(task.envision_milestone ?? "")) &&
      (priority.size === 0 || priority.has(task.priority ?? "")) &&
      (assignee.size === 0 ||
        task.assignees.some((user) => assignee.has(user))) &&
      (tag.size === 0 ||
        (task._user_tags ?? "").split(",").some((name) => tag.has(name)))
  )
}

// One URL key per field, values joined with commas ("priority=Urgent,High"),
// through nuqs and its TanStack Router adapter (routes/__root.tsx). `edited`
// marks a URL that holds changes to a saved view; see useBoardFilters.
const list = parseAsArrayOf(parseAsString)
const filterParsers = {
  project: list,
  milestone: list,
  priority: list,
  assignee: list,
  tag: list,
  edited: parseAsBoolean,
}

const CLEARED = {
  project: null,
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
 *
 * Only `fields` are read from the URL (boardFilterFields).
 */
export function useBoardFilters(
  saved: TaskFilters | null,
  fields: readonly TaskFilterField[]
): BoardFilters {
  const [state, setState] = useQueryStates(filterParsers, {
    history: "replace",
  })
  const inUrl = React.useMemo(
    () => onlyFields(toTaskFilters(state), fields),
    [state, fields]
  )
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
        project: next.project.length ? [...next.project] : null,
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
