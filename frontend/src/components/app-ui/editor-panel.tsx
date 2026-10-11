import * as React from "react"
import { CheckIcon, Maximize2Icon, Minimize2Icon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import { DialogContent, DialogTitle } from "@/components/ui/dialog"
import { SheetContent, SheetTitle } from "@/components/ui/sheet"
import type { CommandId } from "@/lib/commands"
import { cn } from "@/lib/utils"

/**
 * The create panels and their expanded description (Paper 01, 03, 06a/06b,
 * 07a/07b, Links 02, and the settings and record pages' description): one
 * surface with two layouts, a 520px panel or the centred 1120 × 856 writing
 * surface, and the chrome that switches between them.
 */

/**
 * A Sheet popup, restyled: a 520px panel on the right, or the centred writing
 * surface, which pins all four edges and centres with auto margins. The
 * `data-[side=right]:` prefixes match SheetContent's own classes so they
 * replace them rather than compete with them.
 */
function CreateSheetContent({
  expanded = false,
  className,
  ...props
}: React.ComponentProps<typeof SheetContent> & { expanded?: boolean }) {
  return (
    <SheetContent
      side="right"
      showCloseButton={false}
      className={cn(
        expanded
          ? "gap-0 overflow-hidden rounded-3xl p-0 ring-1 ring-foreground/5 data-[side=right]:left-0 data-[side=right]:m-auto data-[side=right]:h-[min(856px,calc(100dvh-3rem))] data-[side=right]:w-full data-[side=right]:max-w-[calc(100%-2rem)] data-[side=right]:border-s-0 data-[side=right]:sm:max-w-[1120px]"
          : "gap-0 p-7 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]",
        className
      )}
      {...props}
    />
  )
}

/** The same two layouts on a Dialog popup. */
function CreateDialogContent({
  expanded = false,
  className,
  ...props
}: React.ComponentProps<typeof DialogContent> & { expanded?: boolean }) {
  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        "gap-0 rounded-3xl",
        expanded
          ? "flex h-[min(856px,calc(100dvh-3rem))] flex-col overflow-hidden p-0 sm:max-w-[1120px]"
          : "sm:max-w-[520px]",
        className
      )}
      {...props}
    />
  )
}

/** A panel's 24px title, on whichever popup holds it. */
function PanelTitle({
  surface,
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle> & {
  surface: "dialog" | "sheet"
}) {
  return surface === "sheet" ? (
    <SheetTitle
      className={cn("text-2xl font-semibold tracking-tight", className)}
      {...props}
    />
  ) : (
    <DialogTitle
      className={cn("text-2xl font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

/**
 * The compact panel's close button, for a `SheetClose` or `DialogClose` to
 * render; the Close part supplies the icon and its label.
 */
function PanelCloseButton({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn("-me-1 -mt-1 bg-secondary", className)}
      {...props}
    />
  )
}

type ChromeButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "variant" | "size" | "children"
>

/** Opens the writing surface, beside the Description label. */
function EditorExpandButton({
  command,
  className,
  ...props
}: ChromeButtonProps & { command: CommandId }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={cn("h-7 gap-1.5 rounded-md px-2", className)}
      {...props}
    >
      <Maximize2Icon className="size-3.5" />
      Expand
      <HotkeyText
        command={command}
        className="font-normal text-muted-foreground"
      />
    </Button>
  )
}

/** Returns to the panel, in the writing surface's header. */
function EditorCollapseButton({
  command,
  className,
  ...props
}: ChromeButtonProps & { command: CommandId }) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("h-9.5 gap-2 rounded-full px-3", className)}
      {...props}
    >
      <Minimize2Icon />
      Collapse
      <HotkeyText
        command={command}
        className="text-xs font-normal text-muted-foreground"
      />
    </Button>
  )
}

/** Returns to the panel, in the writing surface's footer. */
function EditorDoneButton({ className, ...props }: ChromeButtonProps) {
  return (
    <Button
      type="button"
      size="lg"
      className={cn("gap-3 px-5 font-semibold", className)}
      {...props}
    >
      Done
      <CheckIcon />
    </Button>
  )
}

export {
  CreateDialogContent,
  CreateSheetContent,
  EditorCollapseButton,
  EditorDoneButton,
  EditorExpandButton,
  PanelCloseButton,
  PanelTitle,
}
