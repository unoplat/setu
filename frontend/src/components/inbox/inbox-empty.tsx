import { BellIcon, CircleAlertIcon, ListFilterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

// Paper 10b, "Empty State": a dashed panel with the icon in a muted circle,
// a title and a line of help. The filtered and failed variants keep its
// shape so the page holds still between them.

const PANEL_CLASS = "flex-none border border-input px-6 py-24"

const ICON_CLASS = "size-11 rounded-full"

/**
 * Nothing to show: "You're all caught up", or, with a filter on, that
 * nothing matches it.
 */
export function InboxEmpty({ filtered }: { filtered: boolean }) {
  return (
    <Empty className={PANEL_CLASS}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className={ICON_CLASS}>
          {filtered ? <ListFilterIcon /> : <BellIcon />}
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">
          {filtered ? "Nothing matches these filters" : "You're all caught up"}
        </EmptyTitle>
        <EmptyDescription className="max-w-90">
          {filtered
            ? "Try another type or project, or turn off Unread only."
            : "When someone assigns you a task or mentions you in a comment, it shows up here."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/** The first page could not be loaded; "Try again" refetches it. */
export function InboxLoadError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Empty className={PANEL_CLASS}>
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn(ICON_CLASS, "bg-destructive/10 text-destructive")}
        >
          <CircleAlertIcon />
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">
          Your inbox could not be loaded
        </EmptyTitle>
        <EmptyDescription className="max-w-90">{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  )
}
