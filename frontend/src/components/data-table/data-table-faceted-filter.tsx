import { PlusCircleIcon } from "lucide-react"

import { useDataTable } from "@/components/data-table/data-table-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { toolbarButtonClassName } from "@/lib/style"
import { cn } from "@/lib/utils"

import type { DataTableCheckboxFilterField } from "./types"

/**
 * A multi-select filter behind a dashed toolbar button (Paper 06c), after the
 * faceted filter in shadcn's Tasks example. The counts are the table's facets,
 * so they follow the other active filters.
 * https://github.com/shadcn-ui/ui/tree/main/apps/v4/app/(app)/examples/tasks
 */
export function DataTableFacetedFilter<TData>({
  value,
  label,
  options = [],
}: DataTableCheckboxFilterField<TData>) {
  const { table, columnFilters } = useDataTable()
  const column = table.getColumn(value as string)
  const facets = column?.getFacetedUniqueValues()
  // The context's filters, not `column.getFilterValue()`: that reads the
  // table's store and can lag a render behind the controlled state.
  const filterValue = columnFilters.find((filter) => filter.id === value)?.value
  const selected = new Set<unknown>(
    Array.isArray(filterValue) ? filterValue : []
  )

  function toggle(optionValue: unknown) {
    const next = new Set(selected)
    if (next.has(optionValue)) next.delete(optionValue)
    else next.add(optionValue)
    column?.setFilterValue(next.size ? [...next] : undefined)
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(toolbarButtonClassName, "border-dashed")}
          />
        }
      >
        <PlusCircleIcon />
        {label}
        {selected.size > 0 ? (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-4" />
            <Badge
              variant="secondary"
              className="rounded-sm px-1 font-normal lg:hidden"
            >
              {selected.size}
            </Badge>
            <span className="hidden gap-1 lg:flex">
              {selected.size > 2 ? (
                <Badge
                  variant="secondary"
                  className="rounded-sm px-1 font-normal"
                >
                  {selected.size} selected
                </Badge>
              ) : (
                options
                  .filter((option) => selected.has(option.value))
                  .map((option) => (
                    <Badge
                      key={String(option.value)}
                      variant="secondary"
                      className="rounded-sm px-1 font-normal"
                    >
                      {option.label}
                    </Badge>
                  ))
              )}
            </span>
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={label} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const count = facets?.get(option.value)
                return (
                  <CommandItem
                    key={String(option.value)}
                    value={String(option.value)}
                    keywords={[option.label]}
                    data-checked={selected.has(option.value)}
                    onSelect={() => toggle(option.value)}
                  >
                    <span className="truncate">{option.label}</span>
                    {count ? (
                      <span className="ms-auto font-mono text-xs text-muted-foreground">
                        {count}
                      </span>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
