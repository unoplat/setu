import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  CircleSlashIcon,
} from "lucide-react"
import type { ComponentType } from "react"

import { StatusBadge } from "@/components/app-ui/status-badge"
import { BOARD_COLUMNS, type BoardColumnId } from "@/lib/tasks"
import { cn } from "@/lib/utils"

// Paper 07f/06f: a Task's Status is drawn as its Board column, a 12px icon
// and the column's title in a quiet outlined badge.

type StatusIconProps = { className?: string; "aria-hidden": "true" }

/** Paper 07f/06f: In Progress, a ring half filled from its right. */
function InProgressIcon({
  className,
  "aria-hidden": ariaHidden,
}: StatusIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden={ariaHidden} className={className}>
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      <path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" />
    </svg>
  )
}

/**
 * Each column's icon and colour. The colour is a text-* class read through
 * `currentColor`, so a caller's className can override it.
 */
const STATUS_ICONS: Record<
  BoardColumnId,
  { Icon: ComponentType<StatusIconProps>; className: string }
> = {
  todo: { Icon: CircleIcon, className: "text-muted-foreground" },
  "in-progress": { Icon: InProgressIcon, className: "text-sidebar-primary" },
  review: { Icon: CircleDotIcon, className: "text-sidebar-primary" },
  blocked: { Icon: CircleSlashIcon, className: "text-destructive" },
  done: { Icon: CircleCheckIcon, className: "text-success" },
}

/** Paper 07f/06f: the Status icon of a Board column. */
export function TaskStatusIcon({
  column,
  className,
}: {
  column: BoardColumnId
  className?: string
}) {
  const { Icon, className: colorClass } = STATUS_ICONS[column]
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-3 shrink-0", colorClass, className)}
    />
  )
}

/** Paper 07f/06f: the column's icon and title in an outlined badge. */
export function TaskStatusBadge({
  column,
  className,
}: {
  column: BoardColumnId
  className?: string
}) {
  const title = BOARD_COLUMNS.find((entry) => entry.id === column)?.title
  return (
    <StatusBadge className={className}>
      <TaskStatusIcon column={column} />
      <span className="text-xs/4 font-medium whitespace-nowrap">{title}</span>
    </StatusBadge>
  )
}
