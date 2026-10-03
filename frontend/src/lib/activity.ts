import { useFrappeGetCall } from "frappe-react-sdk"

import type { Assignee } from "@/lib/assignees"

/**
 * A record page's timeline (Paper: 06d, 07d, 09), as setu/api/timeline.py
 * builds it for any document: its comments close the content column, the rest
 * is the rail's Activity log. An entry is a comment, a logged event
 * from Frappe's Comment records (assignment, attachment, info), a tracked
 * change, or the creation itself.
 */
export type ActivityKind =
  | "comment"
  | "assignment"
  | "attachment"
  | "info"
  | "change"
  | "created"

export interface ActivityEntry {
  id: string
  kind: ActivityKind
  owner: string
  /** ISO datetime with its offset. */
  creation: string
  /**
   * A comment's HTML (sanitised by Frappe when it was saved), an event's
   * plain text, or the labels a change touched. Absent on "created".
   */
  content?: string
}

export interface Activity {
  /** Newest first. */
  entries: ActivityEntry[]
  users: Record<string, Assignee>
}

/** One record's timeline, under the key its page revalidates after a save. */
export function useActivity(
  method: string,
  name: string,
  key: readonly string[]
) {
  return useFrappeGetCall<{ message: Activity }>(method, { name }, [...key])
}
