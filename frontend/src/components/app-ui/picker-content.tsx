import * as React from "react"

import { ComboboxContent } from "@/components/ui/combobox"
import { cn } from "@/lib/utils"

/**
 * The popup of a "Combobox in Popup" picker (people, projects, tags, links).
 *
 * The vendored popup is as wide as its trigger, which suits a full-width form
 * field but squeezes names to "A…" under a compact rail value such as "No
 * lead". This sets an 18rem floor; the trigger's width still applies when it
 * is wider, and `--available-width` still caps it on a small screen.
 */
type PickerContentProps = React.ComponentProps<typeof ComboboxContent>

function PickerContent({ className, ...props }: PickerContentProps) {
  return <ComboboxContent className={cn("min-w-72", className)} {...props} />
}

export { PickerContent, type PickerContentProps }
