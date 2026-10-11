import * as React from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/**
 * The panels' form controls (Paper 01, 03, 06a, 07a) and a property's quiet
 * value on a record page (06d, 09), shared by every picker so they cannot
 * drift apart.
 *
 * - "field": the full-width 44px outlined field.
 * - "inline": a quiet 28px ghost value that only shows its box on hover or
 *   while its picker is open, so the rows read as details rather than a
 *   form. A long value wraps onto more lines rather than widening the rail.
 */
type PickerAppearance = "field" | "inline"

/** A form Field with 8px between its label, control and hint. */
function CompactField({
  className,
  ...props
}: React.ComponentProps<typeof Field>) {
  return <Field className={cn("gap-2", className)} {...props} />
}

/** The 44px text field. A layout class such as `h-10` sets another height. */
function FieldInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return <Input className={cn("h-11 rounded-xl", className)} {...props} />
}

/**
 * A picker's trigger Button: a combobox's, a date picker's. `multiple` holds
 * chips that wrap onto more lines (Assignees, Tags); inline, it also hides
 * the chevron, since a "+" says more can be added. Single inline values get
 * 09's 12px chevron.
 */
function PickerTrigger({
  appearance = "field",
  multiple = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size"> & {
  appearance?: PickerAppearance
  multiple?: boolean
}) {
  const inline = appearance === "inline"
  return (
    <Button
      variant={inline ? "ghost" : "outline"}
      className={cn(
        inline
          ? "h-auto min-h-7 w-auto min-w-0 shrink gap-1.5 rounded-sm px-2 py-1 text-start font-normal whitespace-normal"
          : "h-11 w-full justify-between gap-2 rounded-xl px-3.5 font-normal",
        inline && !multiple && "gap-2 [&>svg:last-child]:size-3",
        inline && multiple && "py-0.75 [&>svg:last-child]:hidden",
        !inline && multiple && "h-auto min-h-11 py-2",
        className
      )}
      {...props}
    />
  )
}

/**
 * A closed list's trigger (Status, Priority), drawn as the outlined or ghost
 * Button pickers beside it. `data-[size=default]:` overrides the height
 * SelectTrigger sets through that same selector. The trigger draws its own
 * chevron; inline, it is 09's 12px one.
 */
function PickerSelectTrigger({
  appearance = "field",
  className,
  ...props
}: React.ComponentProps<typeof SelectTrigger> & {
  appearance?: PickerAppearance
}) {
  const inline = appearance === "inline"
  return (
    <SelectTrigger
      className={cn(
        // Composes the Button's own variant so the select cannot drift from
        // the Button pickers it sits beside; the linter cannot read the call.
        // oxlint-disable-next-line shadcn/require-static-classes -- buttonVariants is the shared Button contract
        buttonVariants({ variant: inline ? "ghost" : "outline" }),
        inline
          ? "h-auto min-h-7 w-auto min-w-0 shrink gap-1.5 rounded-sm border-transparent bg-transparent px-2 py-1 text-start text-sm font-normal whitespace-normal data-[size=default]:h-7 *:data-[slot=select-value]:gap-2 dark:bg-transparent [&>svg:last-child]:size-3"
          : "h-11 w-full justify-between gap-2 rounded-xl px-3.5 font-normal data-[size=default]:h-11",
        className
      )}
      {...props}
    />
  )
}

export {
  CompactField,
  FieldInput,
  PickerSelectTrigger,
  PickerTrigger,
  type PickerAppearance,
}
