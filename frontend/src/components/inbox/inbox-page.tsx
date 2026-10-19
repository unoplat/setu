import { useCallback, useId } from "react"
import type { FrappeError } from "frappe-react-sdk"
import { CheckCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { InboxEmpty, InboxLoadError } from "@/components/inbox/inbox-empty"
import { InboxFilters } from "@/components/inbox/inbox-filters"
import { InboxRow, InboxRowSkeleton } from "@/components/inbox/inbox-row"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  inboxHasMore,
  inboxItems,
  useInbox,
  useInboxCounts,
  useInboxEvents,
  useMarkInboxRead,
  withRead,
  type InboxItem,
  type InboxPage as InboxPageData,
  type InboxRecord,
} from "@/lib/inbox"
import {
  useInboxFilter,
  useInboxProject,
  useInboxUnreadOnly,
} from "@/lib/inbox-store"

// Paper 10c: the Inbox, the signed-in user's Notification Log rows on
// Envision records (lib/inbox.ts), one row per notification. The rows come
// unread first, then newest first, so the Unread and Earlier sections are
// the list cut where the read rows start, never re-sorted. Paper 10b is its
// empty state.

const SKELETON_ROWS = [0, 1, 2, 3]

export function InboxPage() {
  const filter = useInboxFilter()
  const unreadOnly = useInboxUnreadOnly()
  const project = useInboxProject()
  const {
    data: pages,
    error,
    isLoading,
    mutate,
    size,
    setSize,
  } = useInbox({ filter, unreadOnly, project })
  const { data: counts } = useInboxCounts(project)
  const { markRecordRead, markAllRead } = useMarkInboxRead()

  // A new notification, or a read in another tab, refreshes every page shown.
  const refresh = useCallback(() => {
    void mutate()
  }, [mutate])
  useInboxEvents(refresh)

  /**
   * Shows the record's rows, or every row, read at once; the server's answer
   * then refreshes the pages, and a failure puts them back as they were.
   * "Mark all read" keeps to the project picked, as the rows on screen do.
   */
  const markRead = useCallback(
    (record?: InboxRecord) => {
      const request = record
        ? markRecordRead(record.kind, record.name)
        : markAllRead(project)
      mutate(
        request.then(() => undefined),
        {
          optimisticData: (current) => withRead(current, record) ?? [],
          populateCache: false,
          rollbackOnError: true,
          revalidate: true,
        }
      ).catch((failure: FrappeError) => {
        toast.error(
          record
            ? `“${record.title ?? "Deleted item"}” could not be marked read`
            : "Your inbox could not be marked read",
          { description: frappeErrorMessage(failure) }
        )
      })
    },
    [markRecordRead, markAllRead, mutate, project]
  )

  const filtered = filter !== "all" || unreadOnly || project !== null
  // 10b: with nothing at all to show, the page is only its heading and the
  // empty state.
  const caughtUp =
    pages !== undefined && inboxItems(pages).length === 0 && !filtered

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
        <SidebarTrigger />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Inbox</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <main className="flex-1 overflow-y-auto px-6 pt-12 pb-16">
        <div className="mx-auto flex w-full max-w-190 flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-3xl/9 font-semibold tracking-tight">Inbox</h1>
              <p className="text-sm text-muted-foreground">
                Assignments and mentions across your projects.
              </p>
            </div>
            {caughtUp ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!counts || counts.message.unread === 0}
                onClick={() => markRead()}
              >
                <CheckCheckIcon />
                Mark all read
              </Button>
            )}
          </div>
          {caughtUp ? null : <InboxFilters counts={counts?.message} />}
          <InboxBody
            pages={pages}
            error={error}
            loading={isLoading}
            filtered={filtered}
            loadingMore={pages !== undefined && pages[size - 1] === undefined}
            onRetry={refresh}
            onLoadMore={() => void setSize(size + 1)}
            onMarkRead={markRead}
          />
        </div>
      </main>
    </>
  )
}

/**
 * The rows, or what stands in for them: skeletons while the first page loads,
 * the error when it fails, the empty state when nothing matches. The rows come
 * unread first, so the two sections are the list cut where the read rows
 * start. "Load more" waits on the page it asked for, the one still missing.
 */
function InboxBody({
  pages,
  error,
  loading,
  filtered,
  loadingMore,
  onRetry,
  onLoadMore,
  onMarkRead,
}: {
  pages: InboxPageData[] | undefined
  error: FrappeError | undefined
  loading: boolean
  filtered: boolean
  loadingMore: boolean
  onRetry: () => void
  onLoadMore: () => void
  onMarkRead: (record: InboxRecord) => void
}) {
  if (!pages) {
    // A retry after a failure shows the skeletons again until it answers.
    return error && !loading ? (
      <InboxLoadError message={frappeErrorMessage(error)} onRetry={onRetry} />
    ) : (
      <div aria-busy="true" aria-label="Loading inbox">
        {SKELETON_ROWS.map((row) => (
          <InboxRowSkeleton key={row} />
        ))}
      </div>
    )
  }
  const items = inboxItems(pages)
  if (!items.length) return <InboxEmpty filtered={filtered} />
  return (
    <div className="flex flex-col gap-8">
      <InboxSection
        label="Unread"
        items={items.filter((item) => !item.read)}
        onMarkRead={onMarkRead}
      />
      <InboxSection
        label="Earlier"
        items={items.filter((item) => item.read)}
        onMarkRead={onMarkRead}
      />
      {inboxHasMore(pages) ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** 10c's "Unread Group" and "Earlier Group"; left out when empty. */
function InboxSection({
  label,
  items,
  onMarkRead,
}: {
  label: string
  items: readonly InboxItem[]
  onMarkRead: (record: InboxRecord) => void
}) {
  const headingId = useId()
  if (!items.length) return null
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2
        id={headingId}
        className="px-3 pb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase"
      >
        {label}
      </h2>
      <div role="list" className="flex flex-col gap-1">
        {items.map((item) => (
          <InboxRow key={item.name} item={item} onMarkRead={onMarkRead} />
        ))}
      </div>
    </section>
  )
}
