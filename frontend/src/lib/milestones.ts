import {
  differenceInCalendarDays,
  format,
  isSameYear,
  parseISO,
} from "date-fns"
import { useFrappeGetCall } from "frappe-react-sdk"

import { useConfirmCount } from "@/lib/confirm-count"

/**
 * A project's milestones. Each one is an ERPNext Task with Is Milestone
 * checked (see setu/api/milestone.py), which is why the server hands back a
 * shape of its own rather than the raw Task fields.
 */

export interface MilestoneAssignee {
  name: string
  full_name: string
  user_image: string | null
}

export interface Milestone {
  name: string
  subject: string
  /** The rich text editor's HTML, or "" when there is none. */
  description: string
  /** ISO days, not the Task's datetimes. */
  start_date: string | null
  due_date: string | null
  status: string
  progress: number
  assignee: MilestoneAssignee | null
}

/** Shared SWR key so a create can revalidate the list that is on screen. */
export function milestonesKey(project: string) {
  return ["envision:milestones", project]
}

export function useMilestones(project: string) {
  return useFrappeGetCall<{ message: Milestone[] }>(
    "setu.api.milestone.list_milestones",
    { project },
    milestonesKey(project)
  )
}

/** A milestone as its detail screen needs it (setu.api.milestone.get_milestone). */
export interface MilestoneDetail extends Milestone {
  project: string | null
  project_name: string | null
  owner: string
  /** ISO datetimes with their offsets. */
  creation: string
  modified: string
  /** Whether this user may edit it; read-only viewers get no editor. */
  can_write: boolean
}

export function milestoneKey(name: string) {
  return ["envision:milestone", name]
}

export function useMilestone(name: string) {
  return useFrappeGetCall<{ message: MilestoneDetail }>(
    "setu.api.milestone.get_milestone",
    { name },
    milestoneKey(name)
  )
}

/**
 * How many Tasks deleting the milestone leaves with no milestone, for its
 * confirm (setu.api.milestone.count_linked_tasks).
 */
export function useLinkedTaskCount(name: string) {
  return useConfirmCount<{ tasks: number }>(
    "setu.api.milestone.count_linked_tasks",
    { name },
    ["envision:milestone-linked-tasks", name]
  )
}

/** The milestone's timeline (setu.api.milestone.get_milestone_activity). */
export function milestoneActivityKey(name: string) {
  return ["envision:milestone-activity", name]
}

/** "Apr 14, 2026": one ISO day, as the screens show it. */
export function formatDay(value: string): string {
  return format(parseISO(value), "MMM d, yyyy")
}

/** "Apr 14", with the year only when it is not this one. */
export function formatShortDay(value: string, today = new Date()): string {
  const date = parseISO(value)
  return format(date, isSameYear(date, today) ? "MMM d" : "MMM d, yyyy")
}

/**
 * What a due date means today: "Due in 3 days", "Due today", "2 days
 * overdue". `overdue` is false for the past cases, so the page can colour
 * only those.
 */
export function dueHint(
  due: string,
  today = new Date()
): { text: string; overdue: boolean } {
  const days = differenceInCalendarDays(parseISO(due), today)
  if (days < 0) {
    return {
      text: days === -1 ? "1 day overdue" : `${-days} days overdue`,
      overdue: true,
    }
  }
  const text =
    days === 0
      ? "Due today"
      : days === 1
        ? "Due tomorrow"
        : days < 14
          ? `Due in ${days} days`
          : `Due in ${Math.round(days / 7)} weeks`
  return { text, overdue: false }
}

/** "Apr 14 – Apr 24, 2026", or "Due Apr 24, 2026" without a start. */
export function formatDateRange(
  start: string | null,
  due: string | null
): string {
  if (!due) return start ? `From ${formatDay(start)}` : "No dates"
  if (!start) return `Due ${formatDay(due)}`
  const [from, to] = [parseISO(start), parseISO(due)]
  const fromFormat = isSameYear(from, to) ? "MMM d" : "MMM d, yyyy"
  return `${format(from, fromFormat)} – ${format(to, "MMM d, yyyy")}`
}
