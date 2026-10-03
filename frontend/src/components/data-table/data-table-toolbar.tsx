import { SearchIcon, XIcon } from "lucide-react"

import { useDataTable } from "@/components/data-table/data-table-provider"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { toolbarButtonClassName } from "@/lib/style"

import { DataTableDateFilter } from "./data-table-date-filter"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"
import type { DataTableInputFilterField } from "./types"

/**
 * Paper 06c: search, then a dashed button per filter, then View on the right.
 * The layout of shadcn's data table toolbar (Tasks example), fed by the
 * table's `filterFields`. Every control writes `column.setFilterValue`, and
 * DataTableProvider's store sync carries it to the URL.
 * https://ui.shadcn.com/docs/components/data-table
 */
export function DataTableToolbar() {
  const { table, filterFields, columnFilters } = useDataTable()

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {filterFields.map((field) => {
          const key = String(field.value)
          switch (field.type) {
            case "input":
              return <DataTableSearchFilter key={key} {...field} />
            case "checkbox":
              return <DataTableFacetedFilter key={key} {...field} />
            case "timerange":
              return <DataTableDateFilter key={key} {...field} />
            default:
              // Sliders have no toolbar control yet.
              return null
          }
        })}
        {columnFilters.length > 0 ? (
          <Button
            variant="ghost"
            className={toolbarButtonClassName}
            onClick={() => table.resetColumnFilters()}
          >
            Reset
            <XIcon />
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <DataTableViewOptions />
      </div>
    </div>
  )
}

function DataTableSearchFilter<TData>({
  value,
  label,
  placeholder,
}: DataTableInputFilterField<TData>) {
  const { table, columnFilters } = useDataTable()
  const column = table.getColumn(value as string)
  const filterValue = columnFilters.find((filter) => filter.id === value)?.value

  return (
    <InputGroup className="h-8 w-40 rounded-md lg:w-62.5">
      <InputGroupAddon>
        <SearchIcon className="size-3.5" />
      </InputGroupAddon>
      <InputGroupInput
        aria-label={label}
        placeholder={placeholder ?? `Filter ${label.toLowerCase()}...`}
        value={typeof filterValue === "string" ? filterValue : ""}
        // An empty string removes the filter (`includesString` auto-removes
        // falsy values), which also clears it from the URL.
        onChange={(event) => column?.setFilterValue(event.target.value)}
        className="text-[13px]"
      />
    </InputGroup>
  )
}
