"use client"

import type { DatePreset } from "@/components/data-table/types"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { presets as defaultPresets } from "@/lib/date-preset"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"
import * as React from "react"
import type { DateRange } from "react-day-picker"

interface DateRangePickerContentProps {
  date: DateRange | undefined
  setDate: (date: DateRange | undefined) => void
  presets?: DatePreset[]
}

/**
 * The body of the date-range picker: presets, a range calendar and a custom
 * range. The caller owns the popover and its trigger (the toolbar's dashed
 * filter button), so this only mounts while the popover is open — which is
 * also when the preset shortcuts should listen.
 */
export function DateRangePickerContent({
  date,
  setDate,
  presets = defaultPresets,
}: DateRangePickerContentProps) {
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const preset = presets.find((preset) => preset.shortcut === e.key)
      if (preset) setDate({ from: preset.from, to: preset.to })
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [setDate, presets])

  return (
    <>
      <div className="flex flex-col justify-between sm:flex-row">
        <div className="hidden sm:block">
          <DatePresets onSelect={setDate} selected={date} presets={presets} />
        </div>
        <div className="block p-3 sm:hidden">
          <DatePresetsSelect
            onSelect={setDate}
            selected={date}
            presets={presets}
          />
        </div>
        <Separator orientation="vertical" className="h-auto w-px" />
        <Calendar
          // `initialFocus` until react-day-picker 9 deprecated it; gone in
          // 10, which is what shadcn's `calendar` installs today.
          autoFocus
          mode="range"
          defaultMonth={date?.from}
          selected={date}
          onSelect={setDate}
          numberOfMonths={1}
        />
      </div>
      <Separator />
      <CustomDateRange onSelect={setDate} selected={date} />
    </>
  )
}

function DatePresets({
  selected,
  onSelect,
  presets,
}: {
  selected: DateRange | undefined
  onSelect: (date: DateRange | undefined) => void
  presets: DatePreset[]
}) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="mx-3 text-xs text-muted-foreground uppercase">Date Range</p>
      <div className="grid gap-1">
        {presets.map(({ label, shortcut, from, to }) => {
          const isActive = selected?.from === from && selected?.to === to
          return (
            <Button
              key={label}
              variant={isActive ? "outline" : "ghost"}
              onClick={() => onSelect({ from, to })}
              className={cn(
                "flex items-center justify-between gap-6",
                !isActive && "border border-transparent!"
              )}
            >
              <span className="me-auto">{label}</span>
              <Kbd className="uppercase">{shortcut}</Kbd>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function DatePresetsSelect({
  selected,
  onSelect,
  presets,
}: {
  selected: DateRange | undefined
  onSelect: (date: DateRange | undefined) => void
  presets: DatePreset[]
}) {
  // Derived, not state: the selected range already says which preset is on.
  const value = presets.find(
    (p) => p.from === selected?.from && p.to === selected?.to
  )?.shortcut

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const preset = presets.find((p) => p.shortcut === v)
        if (preset) {
          onSelect({ from: preset.from, to: preset.to })
        }
      }}
    >
      {/* REMINDER: the label is rendered here rather than through the select
          value's placeholder. Base UI has no `placeholder` prop there — it
          reads the label off the root's `items` array — and `placeholder` is a
          valid HTML attribute, so passing it typechecks and then renders an
          empty trigger. Picking the muted colour by hand keeps the placeholder
          looking the same on both libraries. */}
      <SelectTrigger className={cn(!value && "text-muted-foreground")}>
        {presets.find((preset) => preset.shortcut === value)?.label ??
          "Date Presets"}
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Date Presets</SelectLabel>
          {presets.map(({ label, shortcut }) => {
            return (
              <SelectItem
                key={label}
                value={shortcut}
                className="flex items-center justify-between [&>span:last-child]:flex [&>span:last-child]:w-full [&>span:last-child]:justify-between"
              >
                <span>{label}</span>
                <Kbd className="ms-2 uppercase">{shortcut}</Kbd>
              </SelectItem>
            )
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

// REMINDER: We can add min max date range validation https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local#setting_maximum_and_minimum_dates_and_times
function CustomDateRange({
  selected,
  onSelect,
}: {
  selected: DateRange | undefined
  onSelect: (date: DateRange | undefined) => void
}) {
  const [dateFrom, setDateFrom] = React.useState<Date | undefined>(
    selected?.from
  )
  const [dateTo, setDateTo] = React.useState<Date | undefined>(selected?.to)
  const debounceDateFrom = useDebounce(dateFrom, 1000)
  const debounceDateTo = useDebounce(dateTo, 1000)

  const formatDateForInput = (date: Date | undefined): string => {
    if (!date) return ""
    const utcDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    return utcDate.toISOString().slice(0, 16)
  }

  React.useEffect(() => {
    onSelect({ from: debounceDateFrom, to: debounceDateTo })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounceDateFrom, debounceDateTo])

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-xs text-muted-foreground uppercase">Custom Range</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid w-full gap-1.5">
          <Label htmlFor="from">Start</Label>
          <Input
            key={formatDateForInput(selected?.from)}
            type="datetime-local"
            id="from"
            name="from"
            defaultValue={formatDateForInput(selected?.from)}
            onChange={(e) => {
              const newDate = new Date(e.target.value)
              if (!Number.isNaN(newDate.getTime())) {
                setDateFrom(newDate)
              }
            }}
            disabled={!selected?.from}
          />
        </div>
        <div className="grid w-full gap-1.5">
          <Label htmlFor="to">End</Label>
          <Input
            key={formatDateForInput(selected?.to)}
            type="datetime-local"
            id="to"
            name="to"
            defaultValue={formatDateForInput(selected?.to)}
            onChange={(e) => {
              const newDate = new Date(e.target.value)
              if (!Number.isNaN(newDate.getTime())) {
                setDateTo(newDate)
              }
            }}
            disabled={!selected?.to}
          />
        </div>
      </div>
    </div>
  )
}
