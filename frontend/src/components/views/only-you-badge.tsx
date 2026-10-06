import { LockIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/** Paper: CV 03, beside the view's name: a view is its creator's alone. */
export function OnlyYouBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <LockIcon />
      Only you
    </Badge>
  )
}
