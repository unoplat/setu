import { ChevronDown, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A Module section's header inside a Board column (Paper: Module Section
// Header, in the Todo column of 02 — Mobile App Board): a chevron and the
// Module's name in small muted capitals, together the toggle that folds the
// section, and a "+" that opens Create Task for that Status and Module. There
// is no count.
export function BoardSectionHeader({
  title,
  columnTitle,
  collapsed,
  onToggleCollapse,
  onAdd,
}: {
  title: string
  columnTitle: string
  collapsed: boolean
  onToggleCollapse: () => void
  onAdd?: () => void
}) {
  return (
    <div className="flex h-[18px] items-center gap-1.5 px-1.5">
      <Button
        type="button"
        variant="ghost"
        className="h-full min-w-0 flex-1 justify-start gap-1.5 rounded-sm px-1.5 text-[10px] leading-[14px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
        data-stop-click
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ChevronDown
          className={cn(
            "size-3 text-muted-foreground/70 transition-transform",
            collapsed && "-rotate-90"
          )}
        />
        <span className="truncate">{title}</span>
      </Button>
      {onAdd ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="me-1 size-[18px] rounded-sm text-muted-foreground"
          onClick={onAdd}
          aria-label={`Add task to ${title} in ${columnTitle}`}
          data-stop-click
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Plus className="size-[13px]" />
        </Button>
      ) : null}
    </div>
  )
}
