import * as React from "react"

import {
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

/**
 * A list page's empty state (Paper 06, 07 and Links 01): an `Empty` holding
 * these parts, with an `ActionButton size="md"` as the action. The page sets
 * the `Empty`'s own placement and the header's width.
 */

function PageEmptyHeader({
  className,
  ...props
}: React.ComponentProps<typeof EmptyHeader>) {
  return <EmptyHeader className={cn("gap-1.5", className)} {...props} />
}

/** The page's icon, 48px in a square, in the sidebar's accent. */
function PageEmptyIcon({
  className,
  ...props
}: Omit<React.ComponentProps<typeof EmptyMedia>, "variant">) {
  return (
    <EmptyMedia
      variant="icon"
      className={cn(
        "mb-2.5 size-12 text-sidebar-primary [&_svg:not([class*='size-'])]:size-5.5",
        className
      )}
      {...props}
    />
  )
}

function PageEmptyTitle({
  className,
  ...props
}: React.ComponentProps<typeof EmptyTitle>) {
  return (
    <EmptyTitle className={cn("text-xl font-semibold", className)} {...props} />
  )
}

function PageEmptyDescription({
  className,
  ...props
}: React.ComponentProps<typeof EmptyDescription>) {
  return (
    <EmptyDescription className={cn("leading-5.5", className)} {...props} />
  )
}

function PageEmptyActions({
  className,
  ...props
}: React.ComponentProps<typeof EmptyContent>) {
  return <EmptyContent className={cn("pt-2", className)} {...props} />
}

export {
  PageEmptyActions,
  PageEmptyDescription,
  PageEmptyHeader,
  PageEmptyIcon,
  PageEmptyTitle,
}
