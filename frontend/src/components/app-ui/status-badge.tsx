import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/** A quiet, compact outlined badge for status icons and labels. */
function StatusBadge({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Badge>, "variant">) {
  return (
    <Badge
      variant="outline"
      className={cn("h-5.5 gap-1.5 rounded-sm py-0", className)}
      {...props}
    />
  )
}

export { StatusBadge }
