import { useFrappeGetCall } from "frappe-react-sdk"

import type { MilestoneAssignee } from "@/lib/milestones"

/**
 * Everyone a milestone or a task can be assigned to. The same list serves
 * every picker, so it is fetched once under a shared key and filtered in the
 * browser rather than re-queried per keystroke.
 */

export type Assignee = MilestoneAssignee

export const ASSIGNEES_KEY = "envision:assignees"

export function useAssignees() {
  return useFrappeGetCall<{ message: Assignee[] }>(
    "setu.api.user.list_assignees",
    undefined,
    ASSIGNEES_KEY
  )
}

/** Two letters for an avatar with no image, as the screens show them. */
export function initials(assignee: Assignee): string {
  const parts = (assignee.full_name || assignee.name)
    .split(/[\s@._-]+/)
    .filter(Boolean)
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0] ?? ""]
  return letters
    .map((part) => (part ?? "").charAt(0))
    .join("")
    .toUpperCase()
}
