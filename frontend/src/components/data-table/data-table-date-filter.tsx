import * as React from "react"
import { format, isSameYear } from "date-fns"
import { PlusCircleIcon, XIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { DateRangePickerContent } from "@/components/custom/date-picker-with-range"
import { useDataTable } from "@/components/data-table/data-table-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { isArrayOfDates } from "@/lib/is-array"
import { toolbarButtonClassName } from "@/lib/style"
import { cn } from "@/lib/utils"

import type { DataTableTimerangeFilterField } from "./types"

/**
 * A date-range filter behind a dashed toolbar button (Paper 06c). The value
 * is `[from]` or `[from, to]`, which the `inDateRange` filter function in
 * lib/table/filterfns.ts reads as "that day" or "between, inclusive".
 */
export function DataTableDateFilter<TData>({
  value,
  label,
  presets,
}: DataTableTimerangeFilterField<TData>) {
  const { table, columnFilters } = useDataTable()
  const column = table.getColumn(value as string)
  const filterValue = columnFilters.find((filter) => filter.id === value)?.value

  const date = React.useMemo<DateRange | undefined>(
    () =>
      Array.isArray(filterValue) && isArrayOfDates(filterValue)
        ? { from: filterValue[0], to: filterValue[1] }
        : undefined,
    [filterValue]
  )

  const setDate = React.useCallback(
    (range: DateRange | undefined) => {
      if (!range?.from) {
        // The custom-range inputs report `{}` when nothing is picked yet;
        // only an explicit clear removes the filter.
        if (!range) column?.setFilterValue(undefined)
        return
      }
      column?.setFilterValue(range.to ? [range.from, range.to] : [range.from])
    },
    [column]
  )

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
        {date?.from ? (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-4" />
            <Badge variant="secondary" className="rounded-sm px-1 font-normal">
              {formatRange(date.from, date.to)}
            </Badge>
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DateRangePickerContent
          date={date}
          setDate={setDate}
          presets={presets}
        />
        {date?.from ? (
          <>
            <Separator />
            <div className="p-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setDate(undefined)}
              >
                <XIcon data-icon="inline-start" />
                Clear filter
              </Button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** "Apr 14 – Apr 24, 2026", or one day when there is no end. */
function formatRange(from: Date, to: Date | undefined) {
  if (!to) return format(from, "MMM d, yyyy")
  const fromFormat = isSameYear(from, to) ? "MMM d" : "MMM d, yyyy"
  return `${format(from, fromFormat)} – ${format(to, "MMM d, yyyy")}`
}
