import * as React from "react"

import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * The Paper confirms and guardrails (delete, unsaved changes): a 480px card
 * with no close button, a 22px title, and a footer of large buttons. Only the
 * presentation lives here; each dialog keeps its own open state and actions.
 */
function PromptDialogContent({
  className,
  ...props
}: Omit<React.ComponentProps<typeof DialogContent>, "showCloseButton">) {
  return (
    <DialogContent
      showCloseButton={false}
      className={cn("gap-6 rounded-3xl p-7 sm:max-w-[480px]", className)}
      {...props}
    />
  )
}

/** The rounded square above a prompt's title. */
function PromptDialogIcon({
  tone,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  tone: "destructive" | "neutral" | "muted"
}) {
  return (
    <div
      className={cn(
        "flex size-10 items-center justify-center rounded-[12px] [&_svg]:size-4.5",
        tone === "destructive" && "bg-destructive/12 text-destructive",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "muted" && "bg-foreground/6 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

/** The title and description, under an optional `PromptDialogIcon`. */
function PromptDialogHeader({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
}) {
  const text = (
    <>
      <DialogTitle className="text-dialog font-semibold tracking-tight wrap-anywhere">
        {title}
      </DialogTitle>
      <DialogDescription className="leading-5.5">
        {description}
      </DialogDescription>
    </>
  )
  if (!icon) return <DialogHeader className="gap-2">{text}</DialogHeader>
  return (
    <DialogHeader className="gap-3.5">
      {icon}
      <div className="flex flex-col gap-2">{text}</div>
    </DialogHeader>
  )
}

function PromptDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn("gap-2.5 pt-1", className)} {...props} />
}

export {
  PromptDialogContent,
  PromptDialogFooter,
  PromptDialogHeader,
  PromptDialogIcon,
}
