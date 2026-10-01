import type {
  DataTableFilterField,
  Option,
} from "@/components/data-table/types"
import type { Module } from "@/lib/modules"
import { createSchema, field } from "@/lib/store/schema"

/**
 * What the modules table keeps in the URL (through the nuqs adapter), so a
 * filtered view survives a reload and can be shared. Each key is the id of
 * the column it filters.
 */

/** Stand-in value for modules without a lead. */
export const NO_LEAD = "no-lead"

export const moduleFilterSchema = createSchema({
  // `field.string()`, not `.default("")`: an empty default would put a phantom
  // filter on every row.
  module_name: field.string(),
  lead: field.array(field.string()).delimiter(","),
  sort: field.sort(),
})

export type ModuleFilterState = typeof moduleFilterSchema._type

/** The toolbar's filters, in the order Paper 07c shows them. */
export function moduleFilterFields(
  modules: Module[]
): DataTableFilterField<Module>[] {
  return [
    {
      label: "Module",
      value: "module_name",
      type: "input",
      placeholder: "Filter modules...",
    },
    {
      label: "Lead",
      value: "lead",
      type: "checkbox",
      options: leadOptions(modules),
    },
  ]
}

/** Everyone leading a module here, by name, then "No lead". */
function leadOptions(modules: Module[]): Option[] {
  const people = new Map<string, string>()
  let noLead = false
  for (const { lead } of modules) {
    if (lead) people.set(lead.name, lead.full_name || lead.name)
    else noLead = true
  }
  const options: Option[] = [...people]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  if (noLead) options.push({ value: NO_LEAD, label: "No lead" })
  return options
}
