import * as React from "react"
import { Maximize2Icon, PlusIcon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import type { CommandId } from "@/lib/commands"
import { cn } from "@/lib/utils"

/**
 * The quiet actions beside a record page section's name (the record pages'
 * Description, Paper 09k's Subtasks): Expand, and an outlined "+" that adds
 * one in place.
 *
 * Either can stay focusable while `disabled`, with base-ui's
 * `focusableWhenDisabled`, so a Tooltip around it can say why it is off.
 * That drops the native `disabled` attribute, which Button's `disabled:`
 * styles key on, so `data-disabled:` ones stand in.
 * https://base-ui.com/react/components/button
 */
const OFF = "data-disabled:cursor-not-allowed data-disabled:opacity-50"

type SectionActionProps = Omit<
  React.ComponentProps<typeof Button>,
  "variant" | "size" | "children"
>

/** Expand and the command's shortcut, in muted text. */
function SectionExpandButton({
  command,
  disabled,
  className,
  ...props
}: SectionActionProps & { command: CommandId }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={disabled}
      className={cn(
        "h-7 gap-1.5 rounded-sm px-2 text-muted-foreground",
        disabled && OFF,
        className
      )}
      {...props}
    >
      <Maximize2Icon className="size-3" />
      Expand
      <HotkeyText command={command} className="text-meta font-normal" />
    </Button>
  )
}

/** The icon-only "+"; `aria-label` names what it adds. */
function SectionAddButton({
  disabled,
  className,
  ...props
}: SectionActionProps & { "aria-label": string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      disabled={disabled}
      className={cn("rounded-md border-input", disabled && OFF, className)}
      {...props}
    >
      <PlusIcon className="size-3.5" />
    </Button>
  )
}

export { SectionAddButton, SectionExpandButton }
