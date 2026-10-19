import { useCallback, useContext, useEffect } from "react"
import { linkOptions } from "@tanstack/react-router"
import {
  FrappeContext,
  useFrappeGetCall,
  useSWRConfig,
  useSWRInfinite,
  type FrappeConfig,
} from "frappe-react-sdk"

import type { InboxView } from "@/lib/inbox-store"

/**
 * The Inbox (Paper: 10c): the Notification Log rows Frappe writes for the
 * signed-in user on Envision records, read through setu/api/inbox.py. One row
 * per notification; the counts are of records, so three unread rows on one
 * Task count once.
 */

export type InboxRecordKind =
  | "task"
  | "milestone"
  | "module"
  | "link"
  | "project"

/** The filter chips: every row, or one type's. */
export type InboxFilter = "all" | "assigned" | "mentions"

export const INBOX_FILTERS: readonly InboxFilter[] = [
  "all",
  "assigned",
  "mentions",
]

export function isInboxFilter(value: string): value is InboxFilter {
  return (INBOX_FILTERS as readonly string[]).includes(value)
}

export interface InboxPerson {
  name: string
  full_name: string | null
  user_image: string | null
}

export interface InboxRecord {
  kind: InboxRecordKind
  name: string
  /** Null once the record is gone: the row shows, without a link. */
  title: string | null
  project: string | null
  project_title: string | null
  /** The Task's status as it is now; tasks and milestones only. */
  status: string | null
}

export interface InboxItem {
  name: string
  /** Frappe's Notification Log type: "Assignment", "Mention", … */
  type: string
  read: boolean
  /** ISO datetime with its offset. */
  creation: string
  /** Frappe's own sentence, translated, as plain text. */
  summary: string
  /** What a mention said, as plain text; null for anything else. */
  excerpt: string | null
  actor: InboxPerson | null
  record: InboxRecord
}

export interface InboxPage {
  /** Unread first, then newest first. */
  items: InboxItem[]
  has_more: boolean
}

export interface InboxCounts {
  /** Records with anything unread: the sidebar badge, the "All" chip. */
  unread: number
  /** Records with an unread assignment, and with an unread mention. */
  assigned: number
  mentions: number
}

const PAGE_LENGTH = 30

const INBOX_KEY = "envision:inbox"
const INBOX_COUNTS_KEY = "envision:inbox-counts"

/** setu's realtime event for a read (setu/api/inbox.py INBOX_EVENT). */
const INBOX_EVENT = "envision_inbox"

type InboxPageKey = readonly [
  typeof INBOX_KEY,
  InboxFilter,
  boolean,
  string,
  number,
]

/** The doctype `mark_record_read` takes for a record. */
const RECORD_DOCTYPES: Record<InboxRecordKind, string> = {
  task: "Task",
  milestone: "Task",
  module: "Envision Module",
  link: "Envision Link",
  project: "Project",
}

/**
 * The Inbox's rows under the page's filters, a page at a time; `setSize`
 * is "Load more". SWR's infinite cache keeps how many pages were revealed
 * while the filters stay the same, and `revalidateAll` refreshes every one,
 * so a record read elsewhere shows as read on whichever page holds it.
 * https://swr.vercel.app/docs/pagination#useswrinfinite
 */
export function useInbox({ filter, unreadOnly, project }: InboxView) {
  const { call } = useContext(FrappeContext) as FrappeConfig
  const getKey = useCallback(
    (index: number, previous: InboxPage | null): InboxPageKey | null =>
      previous && !previous.has_more
        ? null
        : [INBOX_KEY, filter, unreadOnly, project ?? "", index * PAGE_LENGTH],
    [filter, unreadOnly, project]
  )
  const fetchPage = useCallback(
    ([, pageFilter, pageUnreadOnly, pageProject, start]: InboxPageKey) =>
      call
        .get<{ message: InboxPage }>("setu.api.inbox.list_inbox", {
          start,
          limit: PAGE_LENGTH,
          filter: pageFilter,
          unread_only: pageUnreadOnly ? 1 : 0,
          ...(pageProject ? { project: pageProject } : {}),
        })
        .then((response) => response.message),
    [call]
  )
  return useSWRInfinite(getKey, fetchPage, { revalidateAll: true })
}

/** Every row a set of pages holds, in order. */
export function inboxItems(pages: readonly InboxPage[] | undefined) {
  return pages?.flatMap((page) => page.items) ?? []
}

/** Whether "Load more" has anything left to show. */
export function inboxHasMore(pages: readonly InboxPage[] | undefined) {
  return pages?.at(-1)?.has_more ?? false
}

/**
 * The pages with one record's rows read, or every row: what `mark_record_read`
 * and `mark_all_read` will have done, shown before the server answers.
 */
export function withRead(
  pages: readonly InboxPage[] | undefined,
  record?: Pick<InboxRecord, "kind" | "name">
): InboxPage[] | undefined {
  return pages?.map((page) => ({
    ...page,
    items: page.items.map((item) =>
      !record || sameRecord(item.record, record)
        ? { ...item, read: true }
        : item
    ),
  }))
}

/** A task and a milestone are both Tasks, so either kind names the same one. */
function sameRecord(
  a: Pick<InboxRecord, "kind" | "name">,
  b: Pick<InboxRecord, "kind" | "name">
) {
  return (
    RECORD_DOCTYPES[a.kind] === RECORD_DOCTYPES[b.kind] && a.name === b.name
  )
}

/**
 * Records with unread items: every project's (the sidebar badge) or one
 * Project's (the page's chips, under its project filter).
 */
export function useInboxCounts(project: string | null = null) {
  return useFrappeGetCall<{ message: InboxCounts }>(
    "setu.api.inbox.inbox_counts",
    project ? { project } : undefined,
    [INBOX_COUNTS_KEY, project ?? ""]
  )
}

/**
 * Revalidates every Inbox count on screen, whichever project each is for.
 * The rows' infinite pages are not reached this way (SWR's key filter skips
 * them), so a page showing rows also refreshes its own (useInboxEvents).
 */
export function useRevalidateInboxCounts() {
  const { mutate } = useSWRConfig()
  return useCallback(
    () =>
      mutate(
        (key) => Array.isArray(key) && key[0] === INBOX_COUNTS_KEY,
        undefined,
        { revalidate: true }
      ),
    [mutate]
  )
}

/**
 * Calls `refresh` whenever the Inbox may have changed: Frappe's
 * `notification` event, sent to the user after a Notification Log is
 * committed, and setu's `envision_inbox`, sent after a read. Both reach every
 * tab the user has open. Also on reconnect, for anything missed meanwhile.
 * Raw socket listeners, as useActivityRealtime (lib/activity.ts) explains.
 */
export function useInboxEvents(refresh: () => void) {
  const socket = useContext(FrappeContext)?.socket
  useEffect(() => {
    if (!socket) return
    socket.on("notification", refresh)
    socket.on(INBOX_EVENT, refresh)
    socket.on("connect", refresh)
    return () => {
      socket.off("notification", refresh)
      socket.off(INBOX_EVENT, refresh)
      socket.off("connect", refresh)
    }
  }, [socket, refresh])
}

/**
 * Marking read, which the server then tells every tab about. Each resolves
 * once the counts on screen have been refreshed; a failure rejects, for the
 * caller to report.
 */
export function useMarkInboxRead() {
  const { call } = useContext(FrappeContext) as FrappeConfig
  const revalidateCounts = useRevalidateInboxCounts()
  const markRecordRead = useCallback(
    async (kind: InboxRecordKind, name: string) => {
      await call.post("setu.api.inbox.mark_record_read", {
        document_type: RECORD_DOCTYPES[kind],
        document_name: name,
      })
      await revalidateCounts()
    },
    [call, revalidateCounts]
  )
  /** Every project's unread items, or only `project`'s. */
  const markAllRead = useCallback(
    async (project: string | null) => {
      await call.post(
        "setu.api.inbox.mark_all_read",
        project ? { project } : undefined
      )
      await revalidateCounts()
    },
    [call, revalidateCounts]
  )
  return { markRecordRead, markAllRead }
}

/**
 * Opening a record's page marks the user's Inbox items on it read, as
 * Gameplan's track_visit does. Once per record the page shows; the server
 * does nothing when none are unread. Best effort: a page never fails because
 * its Inbox items could not be marked.
 */
export function useMarkRecordRead(kind: InboxRecordKind, name: string) {
  const { markRecordRead } = useMarkInboxRead()
  useEffect(() => {
    if (!name) return
    markRecordRead(kind, name).catch(() => {})
  }, [markRecordRead, kind, name])
}

/** Where a row opens: its record's page, or null once the record is gone. */
export function inboxLink(record: InboxRecord) {
  const name = record.project
  if (record.title === null || name === null) return null
  switch (record.kind) {
    case "task":
      return linkOptions({
        to: "/projects/$name/tasks/$task",
        params: { name, task: record.name },
      })
    case "milestone":
      return linkOptions({
        to: "/projects/$name/milestones/$milestone",
        params: { name, milestone: record.name },
      })
    case "module":
      return linkOptions({
        to: "/projects/$name/modules/$module",
        params: { name, module: record.name },
      })
    case "link":
      return linkOptions({
        to: "/projects/$name/links/$link",
        params: { name, link: record.name },
      })
    case "project":
      return linkOptions({ to: "/projects/$name", params: { name } })
  }
}
