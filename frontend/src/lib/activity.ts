import { useContext, useEffect } from "react"
import { FrappeContext, useFrappeGetCall } from "frappe-react-sdk"

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

/**
 * One subscription per open discussion. Use docinfo_update for comments,
 * assignments and attachments; doc_update refreshes tracked changes too.
 * Do not use the SDK event hook: its cleanup removes other listeners for
 * the same event, and its document listener only watches doc_update.
 */
export function useActivityRealtime(
  doctype: string,
  name: string,
  revalidate: () => Promise<unknown>
) {
  const socket = useContext(FrappeContext)?.socket
  useEffect(() => {
    if (!socket) return

    const refresh = () => {
      // SWR exposes failures through the existing timeline error state.
      void revalidate().catch(() => {})
    }
    const subscribe = () => {
      socket.emit("doc_subscribe", doctype, name)
      // Fetch changes missed while disconnected, including the initial
      // connection if the timeline loaded before the socket was ready.
      refresh()
    }
    const onDocInfo = (event: {
      doc?: { reference_doctype?: string; reference_name?: string }
    }) => {
      if (
        event.doc?.reference_doctype === doctype &&
        event.doc?.reference_name === name
      )
        refresh()
    }
    const onDocUpdate = (event: { doctype?: string; name?: string }) => {
      if (event.doctype === doctype && event.name === name) refresh()
    }

    socket.on("docinfo_update", onDocInfo)
    socket.on("doc_update", onDocUpdate)
    socket.on("connect", subscribe)
    if (socket.connected) subscribe()

    return () => {
      socket.off("docinfo_update", onDocInfo)
      socket.off("doc_update", onDocUpdate)
      socket.off("connect", subscribe)
      if (socket.connected) socket.emit("doc_unsubscribe", doctype, name)
    }
  }, [socket, doctype, name, revalidate])
}

/** One record's timeline, under the key its page revalidates after a save. */
export function useActivity(
  method: string,
  name: string,
  key: readonly string[]
) {
  return useFrappeGetCall<{ message: Activity }>(method, { name }, [...key])
}
