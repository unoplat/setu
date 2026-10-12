import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The Paper frames' call to action: a solid Button with a semibold label and
 * a little more room either side than the stock sizes.
 *
 * - `tone`: "primary" is the stock solid Button. "destructive" is the solid
 *   red one of the delete confirms; the vendored `destructive` variant is a
 *   soft tint. "inverse" is the neutral confirm's near-black button.
 * - `size`: "default" (36px), "md" (38px, page empty states and the Danger
 *   zone) and "lg" (40px, dialog and panel footers).
 */
type ActionButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "variant" | "size"
> & {
  tone?: "primary" | "destructive" | "inverse"
  size?: "default" | "md" | "lg"
}

function ActionButton({
  tone = "primary",
  size = "default",
  className,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      variant="default"
      size={size === "lg" ? "lg" : "default"}
      className={cn(
        "font-semibold",
        size === "default" && "px-3.5",
        size === "md" && "h-9.5 px-4",
        size === "lg" && "px-4.5",
        tone === "destructive" &&
          "bg-destructive text-background hover:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/30",
        tone === "inverse" &&
          "bg-foreground text-background hover:bg-foreground/90 focus-visible:border-foreground focus-visible:ring-foreground/20",
        className
      )}
      {...props}
    />
  )
}

export { ActionButton, type ActionButtonProps }
