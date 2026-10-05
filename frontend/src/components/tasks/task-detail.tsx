import * as React from "react"
import { FlagIcon, LayoutGridIcon, SquareCheckIcon } from "lucide-react"

import {
  DatesProperty,
  PersonValue,
  Property,
  ReadOnlyDescription,
} from "@/components/detail-properties"
import {
  RecordActivityLog,
  RecordComments,
  type ActivitySource,
} from "@/components/record-activity"
import { DetailLayout, KindRow, RailGroup } from "@/components/record-detail"
import { dueHint, formatShortDay, useMilestones } from "@/lib/milestones"
import { useModules } from "@/lib/modules"
import {
  BOARD_COLUMNS,
  BOARD_PALETTE,
  PRIORITY_CLASS,
  TASK_PRIORITIES,
  taskActivityKey,
  type TaskDetail,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"

import { TagChip } from "./tags-combobox"
import { StatusRing } from "./task-selects"

const TASK_ACTIVITY: ActivitySource = {
  doctype: "Task",
  method: "setu.api.task.get_task_activity",
  commentMethod: "setu.api.task.add_task_comment",
  key: taskActivityKey,
  commentScope: "task-comment",
  commentCommand: "task.comment",
  createdLabel: "this task",
}

/** 09's Comments, closing the content column under the description. */
export function TaskComments({ task }: { task: TaskDetail }) {
  return <RecordComments record={task.name} source={TASK_ACTIVITY} />
}

/** 09's Activity, closing the rail under the Tags. */
export function TaskActivityLog({ task }: { task: TaskDetail }) {
  return <RecordActivityLog record={task.name} source={TASK_ACTIVITY} />
}

/** 09's "Task" chip and the Task's ID, above the title. */
export function TaskKind({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5.5 items-center gap-1 rounded-sm border px-2 text-xs font-medium">
        <SquareCheckIcon className="size-3 text-sidebar-primary" />
        Task
      </span>
      <span className="font-mono text-xs text-muted-foreground">{name}</span>
    </div>
  )
}

/**
 * ERPNext marks an open Task past its due date Overdue. The Board shows it in
 * Todo, so the Status reads Todo and this says why the date is late.
 */
export function OverdueNote({ status }: { status: string }) {
  return status === "Overdue" ? (
    <span className="text-xs font-medium text-destructive">Overdue</span>
  ) : null
}

/** A linked record as a plain value: its icon and name, or `emptyLabel`. */
function LinkValue({
  icon,
  label,
  emptyLabel,
}: {
  icon: React.ReactNode
  label: string | null
  emptyLabel: string
}) {
  return label ? (
    <>
      <span className="flex shrink-0 text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </>
  ) : (
    <span className="text-muted-foreground">{emptyLabel}</span>
  )
}

/** 09 for someone who may read the Task but not edit it. */
export function TaskReadOnly({
  task,
  project,
  footer,
  activity,
}: {
  task: TaskDetail
  /** The Project's name (its id). */
  project: string
  /** What follows the description in the content column: the comments. */
  footer: React.ReactNode
  /** What closes the rail: the activity log. */
  activity: React.ReactNode
}) {
  const notSet = <span className="text-muted-foreground">Not set</span>
  const { data: milestones } = useMilestones(project)
  const { data: modules } = useModules(project)
  const milestone = task.milestone
    ? (milestones?.message.find((m) => m.name === task.milestone)?.subject ??
      task.milestone)
    : null
  const module = task.module
    ? (modules?.message.find((m) => m.name === task.module)?.module_name ??
      task.module)
    : null
  const column = BOARD_COLUMNS.find((c) =>
    (c.statuses as readonly string[]).includes(task.status)
  )
  const color = BOARD_PALETTE.find((s) => s.id === column?.color)?.cssVar
  const priority = TASK_PRIORITIES.find((p) => p === task.priority)

  return (
    <DetailLayout
      rail={
        <>
          <RailGroup label="Properties">
            <dl className="flex flex-col">
              <Property label="Status" plain>
                <StatusRing color={color} />
                {column?.title ?? task.status}
                <OverdueNote status={task.status} />
              </Property>
              <Property label="Priority" plain>
                {priority ? (
                  <>
                    <FlagIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        PRIORITY_CLASS[priority]
                      )}
                    />
                    {priority}
                  </>
                ) : (
                  notSet
                )}
              </Property>
              <Property label="Assignee" plain>
                <PersonValue person={task.assignee} emptyLabel="Unassigned" />
              </Property>
            </dl>
          </RailGroup>

          <RailGroup>
            <dl className="flex flex-col">
              <DatesProperty
                plain
                start={
                  task.start_date ? formatShortDay(task.start_date) : notSet
                }
                due={task.due_date ? formatShortDay(task.due_date) : notSet}
                hint={
                  task.due_date && task.status !== "Completed"
                    ? dueHint(task.due_date)
                    : null
                }
              />
              <Property label="Milestone" plain>
                <LinkValue
                  icon={<FlagIcon />}
                  label={milestone}
                  emptyLabel="No milestone"
                />
              </Property>
              <Property label="Module" plain>
                <LinkValue
                  icon={<LayoutGridIcon />}
                  label={module}
                  emptyLabel="No module"
                />
              </Property>
            </dl>
          </RailGroup>

          <RailGroup className="gap-2.5">
            <h2 className="text-[13px] text-muted-foreground">Tags</h2>
            {task.tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tags</p>
            )}
          </RailGroup>

          {activity}
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <KindRow>
            <TaskKind name={task.name} />
          </KindRow>
          <h1 className="text-3xl/9 font-semibold tracking-tight">
            {task.subject}
          </h1>
        </div>
        <ReadOnlyDescription value={task.description} />
      </div>
      {footer}
    </DetailLayout>
  )
}
