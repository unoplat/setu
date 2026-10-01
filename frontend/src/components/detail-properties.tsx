import * as React from "react"
import { ArrowRightIcon } from "lucide-react"

import { AssigneeAvatar } from "@/components/milestones/assignee-avatar"
import { FieldError } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import type { Assignee } from "@/lib/assignees"
import { cn } from "@/lib/utils"

const DescriptionView = React.lazy(
  () => import("@/components/create-project/description-view")
)

// The rows of a record page's properties rail (Paper: 06d, 07d, 09): a 96px
// label, then the value. A value that can be changed is a quiet button that
// shows its box on hover; one that cannot (`plain`) is text on the same left
// edge, so the rail itself says which is which.

/** One row of the rail. */
export function Property({
  label,
  htmlFor,
  plain = false,
  children,
}: {
  label: string
  /** The control this row edits, so the label names and focuses it. */
  htmlFor?: string
  /** The value is text, not a picker: inset it as far as a picker's text. */
  plain?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-9 shrink-0 items-center">
      <dt className="w-24 shrink-0 text-[13px] text-muted-foreground">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </dt>
      <dd
        className={cn(
          "flex min-w-0 items-center gap-2 text-sm",
          plain && "px-2"
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/**
 * Start and due as one row, "Apr 8 → Apr 12", with what the due date means
 * today underneath. `start` and `due` are the two pickers, or plain text.
 */
export function DatesProperty({
  start,
  due,
  hint,
  error,
  plain = false,
}: {
  start: React.ReactNode
  due: React.ReactNode
  /** "Due in 3 days", and whether that is late. */
  hint?: { text: string; overdue: boolean } | null
  error?: string
  plain?: boolean
}) {
  return (
    <div className="flex items-start py-1">
      <dt className="w-24 shrink-0 text-[13px]/7 text-muted-foreground">
        Dates
      </dt>
      <dd className="flex min-w-0 flex-col gap-0.5 text-sm">
        <div
          className={cn(
            "flex min-h-7 flex-wrap items-center",
            plain && "gap-1.5 px-2"
          )}
        >
          {start}
          <ArrowRightIcon
            aria-hidden="true"
            className="size-3 shrink-0 text-muted-foreground"
          />
          {due}
        </div>
        {error ? (
          <FieldError className="px-2 text-xs">{error}</FieldError>
        ) : hint ? (
          <p
            className={cn(
              "px-2 text-xs",
              hint.overdue
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            )}
          >
            {hint.text}
          </p>
        ) : null}
      </dd>
    </div>
  )
}

/** The project as a plain value, where it cannot be changed from the page. */
export function ProjectProperty({ projectName }: { projectName: string }) {
  return (
    <Property label="Project" plain>
      <span className="size-3.5 shrink-0 rounded-sm bg-primary" />
      <span className="truncate">{projectName}</span>
    </Property>
  )
}

/** A person as a property's plain value: avatar and name, or `emptyLabel`. */
export function PersonValue({
  person,
  emptyLabel,
}: {
  person: Assignee | null
  /** "Unassigned", or "No lead" on a module. */
  emptyLabel: string
}) {
  return person ? (
    <>
      <AssigneeAvatar person={person} />
      <span className="truncate">{person.full_name || person.name}</span>
    </>
  ) : (
    <span className="text-muted-foreground">{emptyLabel}</span>
  )
}

/**
 * Progress worked out from the record's Tasks, so never edited: "2 of 5 tasks
 * done", a bar, and one line on where the number comes from.
 */
export function ProgressSummary({
  done,
  total,
  loading,
  note,
}: {
  done: number
  total: number
  /** The Tasks are still loading, so there is no count yet. */
  loading: boolean
  note: string
}) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <>
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-muted-foreground">Progress</span>
        {loading ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          <span className="tabular-nums">
            {done} of {total} {total === 1 ? "task" : "tasks"} done
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-sidebar-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
    </>
  )
}

/** A record's description where it cannot be edited. */
export function ReadOnlyDescription({ value }: { value: string }) {
  return value ? (
    <section aria-label="Description">
      <React.Suspense
        fallback={<Skeleton className="h-24 w-full rounded-lg" />}
      >
        <DescriptionView value={value} />
      </React.Suspense>
    </section>
  ) : (
    <p className="text-[15px]/6 text-muted-foreground">No description yet.</p>
  )
}
