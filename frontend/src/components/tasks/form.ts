import { formOptions } from "@tanstack/react-form"

import {
  TASK_PRIORITIES,
  boardStatus,
  type CreateStatus,
  type TaskDetail,
  type TaskPriority,
} from "@/lib/tasks"

export { submitOnce, useAppForm, withForm } from "@/lib/form"
export { validateDateOrder, visibleError } from "@/components/milestones/form"

/**
 * A new Task's fields, as the Create Task panel (Paper 03) keeps them. Dates
 * are ISO days and the pickers keep ids, the shapes setu.api.task.create_task
 * takes, so nothing is converted on the way out.
 */

export interface TaskValues {
  subject: string
  /** The rich text editor's HTML, or "" when nothing was written. */
  description: string
  /** "YYYY-MM-DD", or "" when unset. */
  start_date: string
  due_date: string
  status: CreateStatus
  priority: TaskPriority
  /** A Frappe user id, or "" for nobody. */
  assignee: string
  /** A milestone Task's name, or "" for none. */
  milestone: string
  /** An Envision Module's name, or "" for none. */
  module: string
  tags: string[]
}

export const EMPTY_TASK: TaskValues = {
  subject: "",
  description: "",
  start_date: "",
  due_date: "",
  status: "Open",
  // ERPNext's own default for a new Task.
  priority: "Medium",
  assignee: "",
  milestone: "",
  module: "",
  tags: [],
}

export const createTaskFormOptions = formOptions({
  defaultValues: EMPTY_TASK,
})

export function validateTaskTitle(value: string): string | undefined {
  return value.trim() ? undefined : "Give the task a title."
}

/**
 * Whether Create is on, and why not: a fresh form reports `canSubmit` true,
 * so the title is checked here without showing its error early (as the
 * milestone panel does).
 */
export type CreateState = "creating" | "incomplete" | "invalid" | "ready"

export function createState(input: {
  subject: string
  canSubmit: boolean
  submitting: boolean
}): CreateState {
  if (input.submitting) return "creating"
  if (!input.subject.trim()) return "incomplete"
  return input.canSubmit ? "ready" : "invalid"
}

export const MISSING_TITLE = "A task title is required."

/**
 * Guardrail "Unsaved draft": closing with a title or a description asks
 * first; the pickers alone are a few clicks to redo.
 */
export function hasDraft(values: TaskValues): boolean {
  return values.subject.trim() !== "" || values.description.trim() !== ""
}

/**
 * A saved Task as the Task page's form holds it (Paper 09). Only called for
 * a Task on the Board, whose Status has a column; Overdue reads as Todo.
 */
export function taskValues(task: TaskDetail): TaskValues {
  return {
    subject: task.subject,
    description: task.description,
    start_date: task.start_date ?? "",
    due_date: task.due_date ?? "",
    status: boardStatus(task.status) ?? "Open",
    priority: TASK_PRIORITIES.find((p) => p === task.priority) ?? "Medium",
    assignee: task.assignee?.name ?? "",
    milestone: task.milestone ?? "",
    module: task.module ?? "",
    tags: task.tags,
  }
}

/** A Task's values as they are saved and compared: the title trimmed. */
export function prepareTask(values: TaskValues): TaskValues {
  return { ...values, subject: values.subject.trim() }
}
