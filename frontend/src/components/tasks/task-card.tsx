import { format, isSameYear, parseISO } from "date-fns"
import { CalendarIcon, FlagIcon, LayersIcon, TagIcon } from "lucide-react"

import { AssigneeAvatar } from "@/components/milestones/assignee-avatar"
import { Badge, badgeVariants } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PRIORITY_CLASS, type TaskCardData } from "@/lib/tasks"
import { cn } from "@/lib/utils"

// Paper: "Task Card — Default Clean" on the Kanban Board. The ID and priority,
// the title, a muted box of what the Task belongs to (milestone, module,
// tags), then its dates and assignee. Rows with nothing to say are left out.

/** Tags shown before the rest collapse into "+N" (PRODUCT.md, Task Cards). */
const VISIBLE_TAGS = 2

function cardDay(value: string): string {
  const day = parseISO(value)
  return format(day, isSameYear(day, new Date()) ? "MMM d" : "MMM d, yyyy")
}

/** "Apr 8 – Apr 18", "Due Apr 18" or "From Apr 8"; null without dates. */
function cardDates(start: string | null, due: string | null): string | null {
  if (start && due) return `${cardDay(start)} – ${cardDay(due)}`
  if (due) return `Due ${cardDay(due)}`
  if (start) return `From ${cardDay(start)}`
  return null
}

function personName(person: { name: string; full_name: string }): string {
  return person.full_name || person.name
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.75 [&_svg]:size-3.5 [&_svg]:shrink-0">
      {icon}
      <span className="shrink-0 text-[11px] leading-3.5 text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

function TaskTags({ tags }: { tags: string[] }) {
  const hidden = tags.slice(VISIBLE_TAGS)
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
      <span className="truncate">{tags.slice(0, VISIBLE_TAGS).join(", ")}</span>
      {hidden.length ? (
        <Tooltip>
          <TooltipTrigger
            // Hovering or focusing lists every tag; a click stays with the
            // tooltip instead of opening the Card.
            data-stop-click
            render={
              <button
                type="button"
                className={cn(
                  badgeVariants({ variant: "outline" }),
                  "h-4 bg-card px-1.5 text-[10px]"
                )}
              />
            }
          >
            +{hidden.length}
            <span className="sr-only"> more tags</span>
          </TooltipTrigger>
          <TooltipContent>{tags.join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}

export function TaskCard({
  data,
  isDragging = false,
}: {
  data: TaskCardData
  isDragging?: boolean
}) {
  const dates = cardDates(data.startDate, data.dueDate)
  const hasDetails = Boolean(data.milestone || data.module || data.tags.length)

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground transition-shadow",
        isDragging && "shadow-md"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="grow text-[11px] leading-4 font-medium text-muted-foreground tabular-nums">
          {data.id}
        </span>
        {data.priority ? (
          <Badge
            variant="secondary"
            className={cn(
              "h-auto rounded-sm bg-muted px-2 py-0.75 text-[11px] leading-4 font-semibold",
              PRIORITY_CLASS[data.priority]
            )}
          >
            {data.priority}
          </Badge>
        ) : null}
      </div>

      <h3 className="text-[15px] leading-5.25 font-semibold tracking-[-0.006em] text-card-foreground">
        {data.title}
      </h3>

      {hasDetails ? (
        <div className="flex flex-col gap-1.25 rounded-md bg-muted p-2">
          {data.milestone ? (
            <DetailRow
              icon={<FlagIcon className="text-sidebar-primary" />}
              label="Milestone"
            >
              <span className="truncate text-xs leading-4 font-semibold">
                {data.milestone}
              </span>
            </DetailRow>
          ) : null}
          {data.module ? (
            <DetailRow
              icon={<LayersIcon className="text-muted-foreground" />}
              label="Module"
            >
              <span className="truncate text-xs leading-4 font-semibold">
                {data.module}
              </span>
            </DetailRow>
          ) : null}
          {data.tags.length ? (
            <DetailRow
              icon={<TagIcon className="text-muted-foreground" />}
              label={data.tags.length > 1 ? "Tags" : "Tag"}
            >
              <TaskTags tags={data.tags} />
            </DetailRow>
          ) : null}
        </div>
      ) : null}

      {dates || data.assignee ? (
        <div className="flex items-center gap-2">
          {dates ? (
            <>
              <CalendarIcon
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0",
                  data.overdue ? "text-destructive" : "text-muted-foreground"
                )}
              />
              <span
                className={cn(
                  "grow truncate text-[11px] leading-4",
                  data.overdue
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {data.overdue ? `Overdue · ${dates}` : dates}
              </span>
            </>
          ) : (
            <span className="grow" />
          )}
          {data.assignee ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <AssigneeAvatar person={data.assignee} />
              {/* Paper shows the first name; the full one is on hover. */}
              <span
                title={personName(data.assignee)}
                className="truncate text-[11px] leading-3.5 font-medium"
              >
                {personName(data.assignee).split(/\s+/)[0]}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * What follows the pointer while a Card is dragged (Paper: 11a — Board rows:
 * dragging a task): the ID, the priority and the title only, so it hides
 * little of the Board under it.
 */
export function TaskDragPreview({ data }: { data: TaskCardData }) {
  return (
    <div className="flex w-57 flex-col gap-1.5 rounded-lg border border-input bg-card px-3 py-2.5 text-card-foreground shadow-2xl">
      <div className="flex items-center gap-2">
        <span className="grow text-[11px] leading-4 font-medium text-muted-foreground tabular-nums">
          {data.id}
        </span>
        {data.priority ? (
          <Badge
            variant="secondary"
            className={cn(
              "h-auto rounded-sm bg-muted px-1.75 py-0.5 text-[11px] leading-4 font-semibold",
              PRIORITY_CLASS[data.priority]
            )}
          >
            {data.priority}
          </Badge>
        ) : null}
      </div>
      <span className="line-clamp-2 text-sm leading-5 font-semibold tracking-[-0.006em]">
        {data.title}
      </span>
    </div>
  )
}
