import * as React from "react"
import { CalendarIcon, ChevronDownIcon } from "lucide-react"
import { DatePicker as DatePickerParts } from "react-date-range-picker-tailwind4"

import { Button } from "@/components/ui/button"
import { formatDay, formatShortDay } from "@/lib/milestones"
import { propertyTriggerClassName } from "@/lib/style"

import { fromIsoDay, toIsoDay } from "./form"

// react-date-range-picker-tailwind4's DatePicker, composed from its parts so
// the trigger is our outline Button (the package's own trigger takes no id or
// aria-invalid, and only shows "YYYY-MM-DD"). Values stay ISO days so the form
// never holds a Date.

/** Modal popups the calendar renders into, see `portalRoot` below. */
const MODAL_POPUP = '[data-slot="sheet-content"], [data-slot="dialog-content"]'

/** The calendar's popup, for hosts that need to know it is open. */
export const DATE_PICKER_POPUP = ".rdrp-content"

// The calendar treats Enter and Space as "pick the focused day" wherever they
// are pressed, so a focused month or Clear button could never be pressed from
// the keyboard. Keep those keys with the button.
function OwnActivationKeys({ children }: { children: React.ReactNode }) {
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation()
      }}
    >
      {children}
    </div>
  )
}

export function DatePicker({
  id,
  value,
  onChange,
  onBlur,
  required = false,
  invalid = false,
  defaultMonth,
  minDate,
  maxDate,
  variant = "field",
  placeholder,
  label,
}: {
  id: string
  /** "YYYY-MM-DD", or "". */
  value: string
  onChange: (value: string) => void
  /** Called when the calendar closes, so the field counts as visited. */
  onBlur?: () => void
  /** A required date offers no Clear button. */
  required?: boolean
  invalid?: boolean
  /** Month to show while nothing is picked, e.g. the other date's. */
  defaultMonth?: string
  /** "YYYY-MM-DD" bounds; days outside them cannot be picked. */
  minDate?: string
  maxDate?: string
  /**
   * "field": the full-width outlined field of a form (06a). "inline": a
   * property's quiet value on the milestone page (06d).
   * "range": one end of a start → due pair in a record's rail (09), the day
   * alone ("Apr 8"), with no chevron.
   */
  variant?: "field" | "inline" | "range"
  /** What the trigger says with no date picked. */
  placeholder?: string
  /** The trigger's accessible name, where no <label> points at it. */
  label?: string
}) {
  const range = variant === "range"
  const inline = variant === "inline" || range
  const [open, setOpen] = React.useState(false)
  const [portalRoot, setPortalRoot] = React.useState<HTMLElement | null>(null)

  const selected = React.useMemo(() => fromIsoDay(value) ?? null, [value])
  const initialMonth = React.useMemo(
    () => fromIsoDay(defaultMonth ?? ""),
    [defaultMonth]
  )
  const min = React.useMemo(() => fromIsoDay(minDate ?? ""), [minDate])
  const max = React.useMemo(() => fromIsoDay(maxDate ?? ""), [maxDate])

  // By default the calendar renders next to its trigger, where a scrolling
  // form would clip it. Inside a Sheet or Dialog, render it into that popup
  // instead: it escapes the scroll box and still counts as inside, so picking
  // a day is not an outside press. (Rendering to <body> would put it behind
  // the modal's overlay.)
  const rootRef = React.useCallback((node: HTMLDivElement | null) => {
    setPortalRoot(node?.closest<HTMLElement>(MODAL_POPUP) ?? null)
  }, [])

  return (
    // The calendar closes itself on Escape without stopping the key, so a
    // Sheet or Dialog around it would close too.
    <div
      className={inline ? "w-fit" : "w-full"}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) event.stopPropagation()
      }}
    >
      <DatePickerParts.Root
        ref={rootRef}
        className={inline ? "w-fit" : "w-full"}
        value={selected}
        onChange={(date) => onChange(date ? toIsoDay(date) : "")}
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) onBlur?.()
        }}
        required={required}
        initialMonth={initialMonth}
        minDate={min}
        maxDate={max}
        shouldCloseOnSelect
      >
        <DatePickerParts.Trigger>
          {({ isOpen, onToggle, triggerRef }) => (
            <Button
              ref={triggerRef}
              id={id}
              type="button"
              variant={inline ? "ghost" : "outline"}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              aria-label={label}
              aria-invalid={invalid || undefined}
              onClick={onToggle}
              className={
                inline
                  ? propertyTriggerClassName
                  : "h-11 w-full justify-between rounded-xl px-3.5 font-normal"
              }
            >
              {value ? (
                range ? (
                  formatShortDay(value)
                ) : (
                  formatDay(value)
                )
              ) : (
                <span className="text-muted-foreground">
                  {placeholder ?? (inline ? "Not set" : "Pick a date")}
                </span>
              )}
              {range ? null : inline ? (
                <ChevronDownIcon className="size-3 text-muted-foreground" />
              ) : (
                <CalendarIcon className="text-muted-foreground" />
              )}
            </Button>
          )}
        </DatePickerParts.Trigger>
        {/* `undefined`, not null: null renders nothing at all. */}
        <DatePickerParts.Content
          portalRoot={portalRoot ?? undefined}
          className="focus-visible:outline-none"
        >
          <OwnActivationKeys>
            <DatePickerParts.Header>
              <DatePickerParts.PrevButton />
              <DatePickerParts.Title />
              <DatePickerParts.NextButton />
            </DatePickerParts.Header>
          </OwnActivationKeys>
          <DatePickerParts.Grid />
          {!required && value ? (
            <OwnActivationKeys>
              <DatePickerParts.Footer>
                <DatePickerParts.ClearButton />
              </DatePickerParts.Footer>
            </OwnActivationKeys>
          ) : null}
        </DatePickerParts.Content>
      </DatePickerParts.Root>
    </div>
  )
}
