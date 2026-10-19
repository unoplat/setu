import * as React from "react"
import {
  useFrappePostCall,
  useSWRConfig,
  type FrappeError,
} from "frappe-react-sdk"
import { Maximize2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  SectionAddButton,
  SectionExpandButton,
} from "@/components/app-ui/section-actions"
import { TableCell, TableRow } from "@/components/custom/table"
import { useDataTable } from "@/components/data-table/data-table-provider"
import { HotkeyHint, HotkeyText } from "@/components/hotkey-hint"
import { DatePicker } from "@/components/milestones/date-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { isMilestoneProgressKey } from "@/lib/milestones"
import {
  projectTasksKey,
  taskActivityKey,
  useSubtasks,
  type TaskDetail,
  type TaskSummary,
} from "@/lib/tasks"

import { AssigneesCombobox } from "./assignees-combobox"
import { CreateTaskSheet } from "./create-task-sheet"
import { EMPTY_TASK, type TaskValues } from "./form"
import type { LinkedTask } from "./linked-task-filters"
import { LinkedTaskTable } from "./linked-task-table"
import { PrioritySelect, StatusSelect } from "./task-selects"

// Paper: 09k — Subtasks: add inline, 09l's empty Subtasks and 09m — Add
// subtask: expanded sheet. The Task's direct Subtasks in the module tasks
// table (07f), "+" for a row typed in place at its foot, and Expand (⌘⇧↵,
// the shortcut that expands the description) for every field in Create
// subtask, which takes what the row held.

/** What the inline row holds; Expand carries all of it into the panel. */
type SubtaskDraft = Pick<
  TaskValues,
  "subject" | "status" | "priority" | "assignees" | "due_date"
>

const EMPTY_DRAFT: SubtaskDraft = {
  subject: EMPTY_TASK.subject,
  status: EMPTY_TASK.status,
  priority: EMPTY_TASK.priority,
  assignees: EMPTY_TASK.assignees,
  due_date: EMPTY_TASK.due_date,
}

/** Why "+" and Expand are off on a Done Task (ERPNext refuses the Subtask). */
const REOPEN_TO_ADD = "Reopen this task to add subtasks"

const NEW_TITLE_ID = "subtask-new-title"

export function SubtasksSection({
  project,
  projectName,
  task,
  canAdd,
}: {
  /** The Project's name (its id). */
  project: string
  projectName: string
  task: TaskDetail
  /** Whether this user may edit the Task, and so add Subtasks under it. */
  canAdd: boolean
}) {
  const { mutate } = useSWRConfig()
  const { tasks, total, done, loading } = useSubtasks(project, task.name)
  const [adding, setAdding] = React.useState(false)
  const [draft, setDraft] = React.useState<SubtaskDraft>(EMPTY_DRAFT)
  // What Create subtask opens with; null while it is closed. Kept in state so
  // its identity holds while the panel is open.
  const [expanded, setExpanded] = React.useState<Partial<TaskValues> | null>(
    null
  )
  const blocked = task.status === "Completed"

  // A Subtask joins the list here, the parent's activity and, through its
  // milestone, that milestone's progress.
  function refresh() {
    return Promise.all([
      mutate(projectTasksKey(project)),
      mutate(taskActivityKey(task.name)),
      mutate(isMilestoneProgressKey),
    ])
  }

  function startAdding() {
    if (adding) document.getElementById(NEW_TITLE_ID)?.focus()
    else setAdding(true)
  }

  function cancelAdding() {
    setAdding(false)
    setDraft(EMPTY_DRAFT)
  }

  function expand() {
    setExpanded({ ...draft, subject: draft.subject.trim() })
  }

  useCommand("task.expandSubtask", expand, {
    enabled: canAdd && !blocked && adding && expanded === null,
  })

  // A Task marked Done while the row was open takes no Subtask.
  const row =
    adding && !blocked ? (
      <InlineSubtaskRow
        project={project}
        parent={task.name}
        parentDue={task.due_date ?? undefined}
        draft={draft}
        onDraftChange={setDraft}
        onCreated={refresh}
        onCancel={cancelAdding}
        onExpand={expand}
      />
    ) : null

  return (
    <section aria-labelledby="subtasks-heading" className="flex flex-col gap-3">
      <SubtasksHeader
        loading={loading}
        total={total}
        done={done}
        canAdd={canAdd}
        blocked={blocked}
        onExpand={expand}
        onAdd={startAdding}
      />

      <SubtasksBody
        project={project}
        tasks={tasks}
        loading={loading}
        canAdd={canAdd}
        blocked={blocked}
        row={row}
      />

      {canAdd ? (
        <CreateTaskSheet
          open={expanded !== null}
          onOpenChange={(open) => {
            if (!open) setExpanded(null)
          }}
          project={project}
          projectName={projectName}
          // `initial` brings the row's Status; this is only the fallback.
          status={EMPTY_TASK.status}
          // A Subtask is part of its parent's milestone unless picked apart.
          milestone={task.milestone ?? undefined}
          parent={task.name}
          initial={expanded ?? undefined}
          onCreated={() => {
            cancelAdding()
            return refresh()
          }}
        />
      ) : null}
    </section>
  )
}

/** The heading, how many are done, and Expand and "+" for those who may add. */
function SubtasksHeader({
  loading,
  total,
  done,
  canAdd,
  blocked,
  onExpand,
  onAdd,
}: {
  loading: boolean
  total: number
  done: number
  canAdd: boolean
  blocked: boolean
  onExpand: () => void
  onAdd: () => void
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <h2 id="subtasks-heading" className="text-sm font-semibold">
          Subtasks
        </h2>
        {loading ? null : (
          <span className="text-xs text-muted-foreground tabular-nums">
            {total ? `${done} of ${total} done` : "0"}
          </span>
        )}
      </div>
      {canAdd ? (
        <div className="flex items-center gap-1.5">
          <ActionTooltip tip={blocked ? REOPEN_TO_ADD : undefined}>
            <SectionExpandButton
              command="task.expandSubtask"
              disabled={blocked}
              focusableWhenDisabled
              onClick={onExpand}
            />
          </ActionTooltip>
          <ActionTooltip tip={blocked ? REOPEN_TO_ADD : "Add subtask"}>
            <SectionAddButton
              aria-label="Add subtask"
              disabled={blocked}
              focusableWhenDisabled
              onClick={onAdd}
            />
          </ActionTooltip>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A header action in a Tooltip when there is something to say: why it is off
 * (it stays focusable and hoverable for this), or what an icon-only one does.
 * https://base-ui.com/react/components/tooltip
 */
function ActionTooltip({
  tip,
  children,
}: {
  tip: string | undefined
  children: React.ReactElement
}) {
  if (!tip) return children
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

/** The loading skeleton, 09l's empty state, or the table with the new row. */
function SubtasksBody({
  project,
  tasks,
  loading,
  canAdd,
  blocked,
  row,
}: {
  project: string
  tasks: TaskSummary[]
  loading: boolean
  canAdd: boolean
  blocked: boolean
  /** The inline add row, or null while it is closed. */
  row: React.ReactElement | null
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-7 w-1/2" />
      </div>
    )
  }
  if (tasks.length === 0 && row === null) {
    return <EmptySubtasks canAdd={canAdd} blocked={blocked} />
  }
  return (
    <LinkedTaskTable
      project={project}
      tasks={tasks}
      noun="subtask"
      appendRow={row}
    />
  )
}

/** 09l: no Subtasks yet, and how to add one. */
function EmptySubtasks({
  canAdd,
  blocked,
}: {
  canAdd: boolean
  blocked: boolean
}) {
  let text: React.ReactNode = "Subtasks of this task are listed here."
  if (canAdd && blocked) text = `${REOPEN_TO_ADD}.`
  else if (canAdd) {
    text = (
      <>
        Press + to add one inline, or Expand{" "}
        <HotkeyText command="task.expandSubtask" /> for every field.
      </>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-input px-4 py-5 text-center">
      <p className="text-sm font-medium">No subtasks yet</p>
      <p className="text-compact text-muted-foreground">{text}</p>
    </div>
  )
}

/**
 * 09k's "Inline add (editing)": a new Subtask typed at the foot of the table,
 * in its columns. Enter creates it and clears the title for the next one;
 * Escape closes the row. While focus is in it, ⌘⇧↵ opens Create subtask
 * (the `subtask-row` scope) instead of expanding the description.
 */
function InlineSubtaskRow({
  project,
  parent,
  parentDue,
  draft,
  onDraftChange,
  onCreated,
  onCancel,
  onExpand,
}: {
  project: string
  parent: string
  /** ERPNext lets no Subtask be due after its parent. */
  parentDue: string | undefined
  draft: SubtaskDraft
  /** Takes an updater, so a pick made while a create is in flight holds. */
  onDraftChange: React.Dispatch<React.SetStateAction<SubtaskDraft>>
  onCreated: () => Promise<unknown>
  onCancel: () => void
  onExpand: () => void
}) {
  const { table } = useDataTable<LinkedTask, unknown>()
  const [focused, setFocused] = React.useState(false)
  const { call, loading } = useFrappePostCall<{
    message: { name: string; subject: string }
  }>("setu.api.task.create_task")
  useScope("subtask-row", focused)

  async function create() {
    const subject = draft.subject.trim()
    if (!subject || loading) return
    const response = await call({
      project,
      parent_task: parent,
      subject,
      status: draft.status,
      priority: draft.priority,
      assignees: draft.assignees.length ? draft.assignees : undefined,
      due_date: draft.due_date || undefined,
    }).catch((error: FrappeError) => {
      toast.error(frappeErrorMessage(error))
      return null
    })
    if (!response) return
    // The picks stay for the next one, as a list is often typed in a row.
    onDraftChange((current) => ({ ...current, subject: "" }))
    await onCreated().catch(() => undefined)
  }

  function cell(id: string): React.ReactNode {
    switch (id) {
      case "subject":
        return (
          <Input
            id={NEW_TITLE_ID}
            aria-label="Subtask title"
            placeholder="Subtask title"
            autoComplete="off"
            autoFocus
            className="h-8"
            value={draft.subject}
            onChange={(event) => {
              const subject = event.target.value
              onDraftChange((current) => ({ ...current, subject }))
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (
                event.key === "Enter" &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey
              ) {
                event.preventDefault()
                void create()
              } else if (event.key === "Escape") {
                event.preventDefault()
                onCancel()
              }
            }}
          />
        )
      case "status":
        return (
          <StatusSelect
            id="subtask-new-status"
            variant="inline"
            value={draft.status}
            onChange={(status) =>
              onDraftChange((current) => ({ ...current, status }))
            }
          />
        )
      case "priority":
        return (
          <PrioritySelect
            id="subtask-new-priority"
            variant="inline"
            value={draft.priority}
            onChange={(priority) =>
              onDraftChange((current) => ({ ...current, priority }))
            }
          />
        )
      case "assignee":
        return (
          <AssigneesCombobox
            id="subtask-new-assignees"
            variant="inline"
            value={draft.assignees}
            onChange={(assignees) =>
              onDraftChange((current) => ({ ...current, assignees }))
            }
          />
        )
      case "due":
        return (
          <DatePicker
            id="subtask-new-due"
            variant="range"
            label="Due date"
            placeholder="Due"
            value={draft.due_date}
            onChange={(due_date) =>
              onDraftChange((current) => ({ ...current, due_date }))
            }
            defaultMonth={parentDue}
            maxDate={parentDue}
          />
        )
      case "actions":
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Expand: open every field"
                  onClick={onExpand}
                />
              }
            >
              <Maximize2Icon className="text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              Open every field in a sheet. Your title comes along.
              <HotkeyHint command="task.expandSubtask" />
            </TooltipContent>
          </Tooltip>
        )
      default:
        return null
    }
  }

  return (
    <TableRow
      aria-label="New subtask"
      className="h-13 bg-muted/30 hover:bg-muted/30"
      // A picker's popup is portalled out of the row, but React bubbles its
      // focus events through the row, so the row stays focused meanwhile.
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false)
        }
      }}
    >
      {table.getVisibleLeafColumns().map((column) => (
        <TableCell
          key={column.id}
          className={column.columnDef.meta?.cellClassName}
        >
          {cell(column.id)}
        </TableCell>
      ))}
    </TableRow>
  )
}
