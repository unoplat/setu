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
  PRIORITY_CLASS,
  TASK_PRIORITIES,
  type CreateStatus,
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

const STATUS_ITEMS = BOARD_COLUMNS.map((column) => ({
  value: column.createStatus,
  label: column.title,
  color: BOARD_PALETTE.find((swatch) => swatch.id === column.color)?.cssVar,
}))

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
}: {
  id: string
  value: CreateStatus
  onChange: (value: CreateStatus) => void
  onBlur?: () => void
  variant?: Variant
}) {
  const inline = variant === "inline"
  return (
    <Select
      items={STATUS_ITEMS}
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
          {(current: CreateStatus) => {
            const item = STATUS_ITEMS.find((entry) => entry.value === current)
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
        {STATUS_ITEMS.map((item) => (
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
