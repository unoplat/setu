import { FlagIcon } from "lucide-react"

import { PickerSelectTrigger } from "@/components/app-ui/field-controls"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  BOARD_COLUMNS,
  BOARD_PALETTE,
  CREATE_COLUMNS,
  PRIORITY_CLASS,
  TASK_PRIORITIES,
  type BoardStatus,
  type TaskPriority,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"

// Paper 03: Status and Priority are closed lists, so they are plain selects,
// drawn as the panel's other 44px outlined fields. On the Task page (09) they
// are a property's quiet value instead, as the milestone page's pickers are.

/**
 * "field": the full-width outlined field of Create Task (03). "inline": a
 * property's quiet value on the Task page (09).
 */
type Variant = "field" | "inline"

interface StatusItem {
  value: BoardStatus
  label: string
  color: string | undefined
}

function statusItem(column: (typeof BOARD_COLUMNS)[number]): StatusItem {
  return {
    value: column.status,
    label: column.title,
    color: BOARD_PALETTE.find((swatch) => swatch.id === column.color)?.cssVar,
  }
}

/** Every column's Status, Cancelled included: what a Task can be moved to. */
const STATUS_ITEMS = BOARD_COLUMNS.map(statusItem)
/** Create Task's: a Task is never created Cancelled. */
const CREATE_STATUS_ITEMS = CREATE_COLUMNS.map(statusItem)

/** The Board column's marker, so the field reads as the column it lands in. */
function StatusDot({ color }: { color: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ? `var(${color})` : undefined }}
    />
  )
}

/** 09's ring before the Status, in its column's colour. */
export function StatusRing({ color }: { color: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.75 shrink-0 rounded-full border-[1.5px]"
      style={{ borderColor: color ? `var(${color})` : undefined }}
    />
  )
}

export function StatusSelect({
  id,
  value,
  onChange,
  onBlur,
  variant = "field",
  creating = false,
}: {
  id: string
  value: BoardStatus
  onChange: (value: BoardStatus) => void
  onBlur?: () => void
  variant?: Variant
  /** Create Task: leave out Cancelled, which no Task is created in. */
  creating?: boolean
}) {
  const inline = variant === "inline"
  const items = creating ? CREATE_STATUS_ITEMS : STATUS_ITEMS
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
    >
      <PickerSelectTrigger appearance={variant} id={id}>
        <SelectValue>
          {(current: BoardStatus) => {
            const item = items.find((entry) => entry.value === current)
            return inline ? (
              <>
                <StatusRing color={item?.color} />
                {item?.label}
              </>
            ) : (
              <>
                <StatusDot color={item?.color} />
                {item?.label}
              </>
            )
          }}
        </SelectValue>
      </PickerSelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <StatusDot color={item.color} />
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PrioritySelect({
  id,
  value,
  onChange,
  onBlur,
  variant = "field",
}: {
  id: string
  value: TaskPriority
  onChange: (value: TaskPriority) => void
  onBlur?: () => void
  variant?: Variant
}) {
  const inline = variant === "inline"
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
    >
      <PickerSelectTrigger appearance={variant} id={id}>
        {inline ? (
          <SelectValue>
            {(current: TaskPriority) => (
              <>
                <FlagIcon
                  className={cn("size-3.5 shrink-0", PRIORITY_CLASS[current])}
                />
                {current}
              </>
            )}
          </SelectValue>
        ) : (
          <SelectValue />
        )}
      </PickerSelectTrigger>
      <SelectContent>
        {TASK_PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={priority}>
            {inline ? (
              <FlagIcon className={cn("size-3.5", PRIORITY_CLASS[priority])} />
            ) : null}
            {priority}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
