import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A Status's dot in its Board column's colour: the Status picker, the phone
 * Board's chips and Search's rows. `color` is a CSS colour (`var(--primary)`);
 * none draws the muted dot. `hollow` draws a ring instead, for Cancelled.
 */
export function StatusDot({
  color,
  hollow = false,
  className,
}: {
  color?: string
  hollow?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-hollow={hollow || undefined}
      className={cn(
        "size-2 shrink-0 rounded-full bg-(--dot,var(--muted-foreground)) data-hollow:border-dot data-hollow:border-(--dot,var(--muted-foreground)) data-hollow:bg-transparent",
        className
      )}
      style={color ? ({ "--dot": color } as React.CSSProperties) : undefined}
    />
  )
}
