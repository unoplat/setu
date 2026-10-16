import type {
  DataTableFilterField,
  Option,
} from "@/components/data-table/types"
import type { Assignee } from "@/lib/assignees"
import { createSchema, field } from "@/lib/store/schema"
import { BOARD_COLUMNS, TASK_PRIORITIES, type TaskSummary } from "@/lib/tasks"

import { PriorityOption, StatusOption } from "./linked-task-cells"

/**
 * What the linked tasks table (a module's or a milestone's Tasks, Paper 07f
 * and 06f) keeps in the URL through the nuqs adapter, so a filtered, sorted
 * page survives a reload and can be shared. Each filter key is the id of the
 * column it filters; `page` (1-based) and `size` are left out at page 1 of 10.
 * The keys are not prefixed, which is safe while the module and milestone
 * pages hold this one table each.
 */

/** Stand-in value for Tasks with nobody assigned. */
export const UNASSIGNED = "unassigned"

const BOARD_COLUMN_IDS = BOARD_COLUMNS.map((column) => column.id)

export const linkedTaskFilterSchema = createSchema({
  // `field.string()`, not `.default("")`: an empty default would put a phantom
  // filter on every row.
  subject: field.string(),
  status: field.array(field.stringLiteral(BOARD_COLUMN_IDS)).delimiter(","),
  priority: field.array(field.stringLiteral(TASK_PRIORITIES)).delimiter(","),
  assignee: field.array(field.string()).delimiter(","),
  sort: field.sort(),
  page: field.number(),
  size: field.number(),
})

export type LinkedTaskFilterState = typeof linkedTaskFilterSchema._type

/** A row of the table: the Task, with what its cells look up. */
export interface LinkedTask extends TaskSummary {
  /** The Project, for the Task's URL. */
  project: string
  /** The first assignee, named; null when nobody is. */
  assignee: Assignee | null
}

/** The toolbar's filters, in the order Paper 07f and 06f show them. */
export function linkedTaskFilterFields(
  tasks: LinkedTask[],
  people: ReadonlyMap<string, Assignee>
): DataTableFilterField<LinkedTask>[] {
  return [
    {
      label: "Task",
      value: "subject",
      type: "input",
      placeholder: "Filter tasks...",
    },
    {
      label: "Status",
      value: "status",
      type: "checkbox",
      component: StatusOption,
      options: BOARD_COLUMNS.map((column) => ({
        label: column.title,
        value: column.id,
      })),
    },
    {
      label: "Priority",
      value: "priority",
      type: "checkbox",
      component: PriorityOption,
      options: TASK_PRIORITIES.map((priority) => ({
        label: priority,
        value: priority,
      })),
    },
    {
      label: "Assignee",
      value: "assignee",
      type: "checkbox",
      options: assigneeOptions(tasks, people),
    },
  ]
}

/** Everyone assigned one of the Tasks, by name, then "Unassigned". */
function assigneeOptions(
  tasks: LinkedTask[],
  people: ReadonlyMap<string, Assignee>
): Option[] {
  const names = new Map<string, string>()
  let unassigned = false
  for (const { assignees } of tasks) {
    if (assignees.length === 0) unassigned = true
    for (const user of assignees) {
      const person = people.get(user)
      names.set(user, person?.full_name || user)
    }
  }
  const options: Option[] = [...names]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  if (unassigned) options.push({ value: UNASSIGNED, label: "Unassigned" })
  return options
}
