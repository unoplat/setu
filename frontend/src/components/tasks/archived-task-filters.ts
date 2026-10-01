import type {
  DataTableFilterField,
  Option,
} from "@/components/data-table/types"
import { createSchema, field } from "@/lib/store/schema"
import type { ArchivedTask } from "@/lib/tasks"

/**
 * What the Archived table keeps in the URL (through the nuqs adapter), as the
 * milestones table does. Each key is the id of the column it filters.
 */
export const archivedTaskFilterSchema = createSchema({
  subject: field.string(),
  archived_by: field.array(field.string()).delimiter(","),
  sort: field.sort(),
})

export type ArchivedTaskFilterState = typeof archivedTaskFilterSchema._type

/** The toolbar's filters, as Paper's Task Archive 04 shows them. */
export function archivedTaskFilterFields(
  tasks: ArchivedTask[]
): DataTableFilterField<ArchivedTask>[] {
  return [
    {
      label: "Title",
      value: "subject",
      type: "input",
      placeholder: "Filter archived tasks...",
    },
    {
      label: "Archived by",
      value: "archived_by",
      type: "checkbox",
      options: archiverOptions(tasks),
    },
  ]
}

function archiverOptions(tasks: ArchivedTask[]): Option[] {
  const people = new Map<string, string>()
  for (const { archived_by } of tasks) {
    if (archived_by) {
      people.set(archived_by.name, archived_by.full_name || archived_by.name)
    }
  }
  return [...people]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
