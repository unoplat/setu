import { formOptions } from "@tanstack/react-form"
import { format, parseISO } from "date-fns"

import type { Milestone } from "@/lib/milestones"

export { submitOnce, useAppForm, withForm } from "@/lib/form"

/**
 * A milestone's editable fields, as the Create Milestone panel (Paper 06a)
 * and the milestone page (06d) both keep them. Dates are ISO days, the shape
 * the API takes, so nothing is converted on the way out.
 */

export interface MilestoneValues {
  subject: string
  /** The rich text editor's HTML, or "" when nothing was written. */
  description: string
  /** "YYYY-MM-DD", or "" when unset. */
  start_date: string
  due_date: string
  /** A Frappe user id, or "" for nobody. */
  assignee: string
}

export const EMPTY_MILESTONE: MilestoneValues = {
  subject: "",
  description: "",
  start_date: "",
  due_date: "",
  assignee: "",
}

export const createMilestoneFormOptions = formOptions({
  defaultValues: EMPTY_MILESTONE,
})

// Declared `string | undefined` rather than inferred, so a server message can
// later be written into the same error map without a type clash.
export function validateMilestoneTitle(value: string): string | undefined {
  return value.trim() ? undefined : "Give the milestone a title."
}

export function validateDueDate(value: string): string | undefined {
  return value ? undefined : "Pick a due date."
}

/** Guardrail "Missing details": start can't be after due. */
export function validateDateOrder(
  startDate: string,
  dueDate: string
): string | undefined {
  if (!startDate || !dueDate) return undefined
  return startDate > dueDate
    ? "Start date can’t be after the due date."
    : undefined
}

/** A field's first message, once the user has touched it or tried to save. */
export function visibleError(meta: {
  isTouched: boolean
  errors: unknown[]
}): string | undefined {
  if (!meta.isTouched) return undefined
  return meta.errors.find((item): item is string => typeof item === "string")
}

/**
 * Whether Create is on, and what the footer says while it is off (guardrail:
 * "Create stays disabled and explains that a title and a due date are
 * required"). A fresh form reports `canSubmit` true, so the required fields
 * are checked here without showing their errors early; anything else that
 * blocks the submit, such as the date order, comes from the form's own
 * validators through `canSubmit`.
 */
export type CreateState = "creating" | "incomplete" | "invalid" | "ready"

export function createState(input: {
  subject: string
  dueDate: string
  canSubmit: boolean
  submitting: boolean
}): CreateState {
  if (input.submitting) return "creating"
  if (!input.subject.trim() || !input.dueDate) return "incomplete"
  return input.canSubmit ? "ready" : "invalid"
}

export const MISSING_DETAILS = "A title and a due date are required."

/**
 * Guardrail "Unsaved draft": closing with a title or a description asks
 * first. Dates and an assignee alone are a few clicks to redo, so they close
 * quietly. The editor reports an emptied document as "", so typing and then
 * deleting everything is not a draft either.
 */
export function hasDraft(values: MilestoneValues): boolean {
  return values.subject.trim() !== "" || values.description.trim() !== ""
}

/** A calendar day as the form keeps it: local, never through UTC. */
export function toIsoDay(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

export function fromIsoDay(value: string): Date | undefined {
  return value ? parseISO(value) : undefined
}

/** A saved milestone as the form holds it. */
export function milestoneValues(milestone: Milestone): MilestoneValues {
  return {
    subject: milestone.subject,
    description: milestone.description,
    start_date: milestone.start_date ?? "",
    due_date: milestone.due_date ?? "",
    assignee: milestone.assignee?.name ?? "",
  }
}

/** A milestone's values as they are saved and compared: the title trimmed. */
export function prepareMilestone(values: MilestoneValues): MilestoneValues {
  return { ...values, subject: values.subject.trim() }
}
