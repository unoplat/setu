import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * A chosen filter value inside a toolbar filter button, as in shadcn's tasks
 * table: a square, quiet secondary badge.
 */
function FilterValueBadge({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Badge>, "variant">) {
  return (
    <Badge
      variant="secondary"
      className={cn("rounded-sm px-1 font-normal", className)}
      {...props}
    />
  )
}

export { FilterValueBadge }
