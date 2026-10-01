import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"

import type {
  DataTableFilterField,
  DatePreset,
  Option,
} from "@/components/data-table/types"
import { createSchema, field } from "@/lib/store/schema"
import type { Milestone } from "@/lib/milestones"

/**
 * What the milestones table keeps in the URL (through the nuqs adapter), so a
 * filtered view survives a reload and can be shared. Each key is the id of
 * the column it filters.
 * https://data-table.openstatus.dev — "State Management", BYOS schema
 */

/** Stand-in value for milestones without an assignee. */
export const UNASSIGNED = "unassigned"

export const PROGRESS_BUCKETS = ["not_started", "in_progress", "done"] as const
export type ProgressBucket = (typeof PROGRESS_BUCKETS)[number]

export function progressBucket(progress: number): ProgressBucket {
  if (progress >= 100) return "done"
  return progress > 0 ? "in_progress" : "not_started"
}

export const PROGRESS_LABELS: Record<ProgressBucket, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
}

export const milestoneFilterSchema = createSchema({
  // `field.string()`, not `.default("")`: an empty default would put a phantom
  // filter on every row.
  subject: field.string(),
  assignee: field.array(field.string()).delimiter(","),
  progress: field.array(field.stringLiteral(PROGRESS_BUCKETS)).delimiter(","),
  due_date: field.array(field.timestamp()).delimiter("-"),
  sort: field.sort(),
})

export type MilestoneFilterState = typeof milestoneFilterSchema._type

/** Due-date shortcuts: milestones mostly look ahead, unlike log timestamps. */
function dueDatePresets(): DatePreset[] {
  const today = new Date()
  return [
    {
      label: "This week",
      from: startOfWeek(today),
      to: endOfWeek(today),
      shortcut: "w",
    },
    {
      label: "Next 7 days",
      from: startOfDay(today),
      to: endOfDay(addDays(today, 7)),
      shortcut: "n",
    },
    {
      label: "This month",
      from: startOfMonth(today),
      to: endOfMonth(today),
      shortcut: "m",
    },
    {
      label: "Next 30 days",
      from: startOfDay(today),
      to: endOfDay(addDays(today, 30)),
      shortcut: "t",
    },
    {
      label: "Last 30 days",
      from: startOfDay(addDays(today, -30)),
      to: endOfDay(today),
      shortcut: "l",
    },
  ]
}

/** The toolbar's filters, in the order Paper 06c shows them. */
export function milestoneFilterFields(
  milestones: Milestone[]
): DataTableFilterField<Milestone>[] {
  return [
    {
      label: "Title",
      value: "subject",
      type: "input",
      placeholder: "Filter milestones...",
    },
    {
      label: "Assignee",
      value: "assignee",
      type: "checkbox",
      options: assigneeOptions(milestones),
    },
    {
      label: "Progress",
      value: "progress",
      type: "checkbox",
      options: PROGRESS_BUCKETS.map((bucket) => ({
        label: PROGRESS_LABELS[bucket],
        value: bucket,
      })),
    },
    {
      label: "Due date",
      value: "due_date",
      type: "timerange",
      presets: dueDatePresets(),
    },
  ]
}

/** Everyone assigned a milestone here, by name, then "Unassigned". */
function assigneeOptions(milestones: Milestone[]): Option[] {
  const people = new Map<string, string>()
  let unassigned = false
  for (const { assignee } of milestones) {
    if (assignee) people.set(assignee.name, assignee.full_name || assignee.name)
    else unassigned = true
  }
  const options: Option[] = [...people]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  if (unassigned) options.push({ value: UNASSIGNED, label: "Unassigned" })
  return options
}
