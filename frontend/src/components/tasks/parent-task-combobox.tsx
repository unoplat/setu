import * as React from "react"
import { CornerLeftUpIcon } from "lucide-react"

import { descendantsOf, useProjectTasks, type TaskSummary } from "@/lib/tasks"

import { LinkCombobox, type LinkOption } from "./link-combobox"

/**
 * Paper 09l's Parent property and 09m's "Parent task" field: the project's
 * Tasks that can hold this one, from the list the Board already loads.
 *
 * Left out are the Task itself and everything under it (a Task cannot move
 * under its own Subtask) and Tasks made in Desk, which cannot hold Subtasks.
 * A Done Task is listed but not pickable while this one is open: ERPNext
 * refuses an open Subtask under it (setu.api.task.check_parent_task).
 */
export function ParentTaskCombobox({
  id,
  project,
  task,
  status,
  value,
  onChange,
  onBlur,
  variant = "field",
}: {
  id: string
  /** The Project's name (its id). */
  project: string
  /** The Task being moved; absent while creating one. */
  task?: string
  /** This Task's Status: a Done one may sit under a Done parent. */
  status: string
  /** The parent's name, or "" for none. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  variant?: "field" | "inline"
}) {
  const { data, isLoading } = useProjectTasks(project)
  const options = React.useMemo(
    () => parentOptions(data ?? [], task, status, value),
    [data, task, status, value]
  )

  return (
    <LinkCombobox
      id={id}
      variant={variant}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      options={options}
      loading={isLoading}
      icon={<CornerLeftUpIcon />}
      noneLabel="No parent"
      searchPlaceholder="Search tasks"
      emptyText="No task matches."
      footer="Picking No parent makes it a top-level task on the Board."
    />
  )
}

function parentOptions(
  tasks: TaskSummary[],
  task: string | undefined,
  status: string,
  current: string
): LinkOption[] {
  const below = task ? descendantsOf(tasks, task) : new Set<string>()
  return tasks
    .filter(
      (candidate) =>
        candidate.is_group &&
        candidate.name !== task &&
        !below.has(candidate.name)
    )
    .map((candidate) => {
      // The parent it already has stays pickable, Done or not.
      const blocked =
        candidate.status === "Completed" &&
        status !== "Completed" &&
        candidate.name !== current
      return {
        value: candidate.name,
        label: candidate.subject,
        detail: blocked
          ? `${candidate.name} · Done, reopen it to add subtasks`
          : candidate.name,
        disabled: blocked,
      }
    })
}
