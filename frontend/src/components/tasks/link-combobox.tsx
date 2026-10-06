import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { propertyTriggerClassName } from "@/lib/style"
import { cn } from "@/lib/utils"

/** One record the Task can link to, as the picker lists it. */
export interface LinkOption {
  /** The record's name (id); "" is the "none" row. */
  value: string
  label: string
  /** The second line: "Due Apr 24", "Lead · Priya Shah". */
  detail?: string
}

// Paper 06e and 07e: the Milestone and Module fields of Create Task. The field
// is a button showing the pick; the popup searches the Project's records,
// starts with an explicit "No milestone" / "No module" row, and says where new
// ones are made, since the panel never creates them (journey guardrail "Not in
// the task form"). On the Task page (09) the field is a property's quiet value,
// the record's icon and name.
export function LinkCombobox({
  id,
  value,
  onChange,
  onBlur,
  options,
  loading,
  icon,
  noneLabel,
  searchPlaceholder,
  emptyText,
  footer,
  variant = "field",
}: {
  id: string
  /** The linked record's name, or "" for none. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  options: LinkOption[]
  loading: boolean
  icon: React.ReactNode
  noneLabel: string
  searchPlaceholder: string
  emptyText: string
  footer: string
  /**
   * "field": the full-width outlined field of Create Task (03). "inline": a
   * property's quiet value on the Task page (09).
   */
  variant?: "field" | "inline"
}) {
  const inline = variant === "inline"
  const none: LinkOption = { value: "", label: noneLabel }
  const items = [none, ...options]
  // A link the list leaves out (a record deleted in Desk) still shows, by id,
  // rather than reading as "none".
  const selected =
    items.find((item) => item.value === value) ??
    (value ? { value, label: value } : none)

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(item) => onChange(item?.value ?? "")}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      isItemEqualToValue={(item, current) => item.value === current.value}
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
    >
      <ComboboxTrigger
        render={
          <Button
            id={id}
            type="button"
            variant={inline ? "ghost" : "outline"}
            disabled={loading}
            className={
              inline
                ? // ComboboxTrigger draws its own chevron; 09's is 12px.
                  `${propertyTriggerClassName} gap-2 [&>svg:last-child]:size-3`
                : "h-11 w-full justify-between gap-2 rounded-xl px-3.5 font-normal"
            }
          />
        }
      >
        {inline && selected.value && !loading ? (
          <span className="flex shrink-0 text-muted-foreground [&_svg]:size-3.5">
            {icon}
          </span>
        ) : null}
        <span
          className={cn(
            "grow text-start",
            // The rail wraps a long name; Create Task's field keeps one line.
            inline ? "wrap-anywhere" : "truncate",
            !selected.value && "text-muted-foreground"
          )}
        >
          {loading ? "Loading…" : selected.label}
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder={searchPlaceholder} />
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: LinkOption) => (
            <ComboboxItem key={item.value || "none"} value={item}>
              {item.value ? (
                <span className="text-muted-foreground">{icon}</span>
              ) : null}
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{item.label}</span>
                {item.detail ? (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {item.detail}
                  </span>
                ) : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </p>
      </ComboboxContent>
    </Combobox>
  )
}
