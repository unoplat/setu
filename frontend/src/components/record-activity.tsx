import * as React from "react"
import {
  differenceInSeconds,
  format,
  formatDistanceToNowStrict,
} from "date-fns"
import {
  useFrappeAuth,
  useFrappeGetDoc,
  useFrappePostCall,
} from "frappe-react-sdk"
import { toast } from "sonner"

import { HotkeyText } from "@/components/hotkey-hint"
import { AssigneeAvatar } from "@/components/milestones/assignee-avatar"
import { RailGroup } from "@/components/record-detail"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { Assignee } from "@/lib/assignees"
import { useActivity, type ActivityEntry } from "@/lib/activity"
import {
  useCommand,
  useScope,
  type CommandId,
  type CommandScope,
} from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { cn } from "@/lib/utils"

// Loaded lazily with the rest of the editor, the largest dependency.
const CommentEditor = React.lazy(
  () => import("@/components/milestones/comment-editor")
)

/**
 * Paper: 06d, 07d and 09. One timeline (setu/api/timeline.py), shown in two
 * places: its comments close the content column in the order they were
 * written, with the comment box under them, so a new comment lands right above
 * where it was written; everything else is the rail's Activity log, newest
 * first. Comments go through Frappe's own add_comment, so they show on the
 * record in Desk too and @mentions notify people.
 */

/** Where one kind of record reads its timeline and posts its comments. */
export interface ActivitySource {
  /** The whitelisted method that returns the timeline. */
  method: string
  /** The whitelisted method that posts a comment. */
  commentMethod: string
  /** The timeline's SWR key, which the page revalidates after a save. */
  key: (name: string) => readonly string[]
  /** The comment box's own scope, and the command that posts from it. */
  commentScope: CommandScope
  commentCommand: CommandId
  /** What the "created" line names ("this module"). */
  createdLabel: string
}

/** The timeline's comments and the comment box, closing the content column. */
export function RecordComments({
  record,
  source,
}: {
  /** The record's name (its id). */
  record: string
  source: ActivitySource
}) {
  const { data, error, isLoading, mutate } = useActivity(
    source.method,
    record,
    source.key(record)
  )
  const activity = data?.message

  // The server sends newest first; comments read oldest first.
  const comments = (activity?.entries ?? [])
    .filter((entry) => entry.kind === "comment")
    .toReversed()

  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Comments</h2>
        {comments.length ? (
          <span className="text-xs text-muted-foreground">
            {comments.length}
          </span>
        ) : null}
      </div>

      {isLoading || (!activity && !error) ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      ) : error || !activity ? (
        <p className="text-[13px] text-muted-foreground">
          {error ? frappeErrorMessage(error) : "Comments could not be loaded."}
        </p>
      ) : comments.length ? (
        <ol className="flex flex-col gap-2">
          {comments.map((entry) => (
            <li key={entry.id}>
              <CommentRow
                entry={entry}
                person={
                  activity.users[entry.owner] ?? fallbackPerson(entry.owner)
                }
              />
            </li>
          ))}
        </ol>
      ) : null}

      <CommentComposer
        record={record}
        source={source}
        onPosted={() => mutate()}
      />
    </section>
  )
}

/**
 * The rail's Activity: everything but the comments, newest first, as a dotted
 * line down the rail's last block.
 */
export function RecordActivityLog({
  record,
  source,
}: {
  /** The record's name (its id). */
  record: string
  source: ActivitySource
}) {
  // The same request as the comments, so SWR fetches it once.
  const { data, error, isLoading } = useActivity(
    source.method,
    record,
    source.key(record)
  )
  const activity = data?.message
  const events = (activity?.entries ?? []).filter(
    (entry) => entry.kind !== "comment"
  )

  return (
    <RailGroup className="gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] text-muted-foreground">Activity</h2>
        <span className="text-xs text-muted-foreground">Newest first</span>
      </div>

      {isLoading || (!activity && !error) ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : error || !activity ? (
        <p className="text-xs text-muted-foreground">
          {error ? frappeErrorMessage(error) : "Activity could not be loaded."}
        </p>
      ) : (
        <ol className="flex flex-col">
          {events.map((entry, index) => {
            const person =
              activity.users[entry.owner] ?? fallbackPerson(entry.owner)
            const last = index === events.length - 1
            return (
              <li key={entry.id} className="flex gap-2.5">
                <div className="flex w-3 shrink-0 flex-col items-center gap-1 pt-1.5">
                  <div
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      index === 0 ? "bg-sidebar-primary" : "bg-muted-foreground"
                    )}
                  />
                  {last ? null : <div className="w-px grow bg-border" />}
                </div>
                <div
                  className={cn(
                    "flex min-w-0 grow flex-col gap-0.5",
                    !last && "pb-3.5"
                  )}
                >
                  <p className="text-[13px]/4.5">{eventText(entry, source)}</p>
                  <p className="text-xs text-muted-foreground">
                    {person.full_name || person.name} ·{" "}
                    <RelativeTime value={entry.creation} />
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </RailGroup>
  )
}

/** One event's line, with who did it on the line under it. */
function eventText(entry: ActivityEntry, source: ActivitySource) {
  if (entry.kind === "created") return `Created ${source.createdLabel}`
  if (entry.kind === "change") return `Changed ${entry.content ?? ""}`
  return entry.content
}

function CommentComposer({
  record,
  source,
  onPosted,
}: {
  record: string
  source: ActivitySource
  onPosted: () => void
}) {
  const { currentUser } = useFrappeAuth()
  const { data: user } = useFrappeGetDoc<{
    full_name?: string
    user_image?: string | null
  }>("User", currentUser ?? undefined, currentUser ? undefined : null)
  const [content, setContent] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  // A new key mounts an empty editor once a comment is posted.
  const [draft, setDraft] = React.useState(0)
  const post = useFrappePostCall<{ message: { name: string } }>(
    source.commentMethod
  )

  const canPost = content !== "" && !post.loading

  async function submit() {
    if (!canPost) return
    const response = await post
      .call({ name: record, content })
      .catch(() => null)
    if (!response) return
    setContent("")
    setDraft((value) => value + 1)
    onPosted()
    toast.success("Comment posted")
  }

  useScope(source.commentScope, focused)
  useCommand(source.commentCommand, () => void submit(), {
    enabled: focused && canPost,
  })

  const me: Assignee = {
    name: currentUser ?? "",
    full_name: user?.full_name ?? currentUser ?? "",
    user_image: user?.user_image ?? null,
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-7 shrink-0 items-center justify-center">
        <AssigneeAvatar person={me} />
      </div>
      <div className="flex min-w-0 grow flex-col gap-2">
        <React.Suspense fallback={<Skeleton className="h-11 rounded-lg" />}>
          <CommentEditor
            key={draft}
            onChange={setContent}
            onFocusChange={setFocused}
          />
        </React.Suspense>
        {/* One line until it is being written in (09). */}
        <div
          className={
            focused || content !== "" || post.error
              ? "flex items-center justify-end gap-2.5"
              : "hidden"
          }
        >
          {post.error ? (
            <p className="me-auto text-xs text-destructive" role="alert">
              {frappeErrorMessage(post.error)}
            </p>
          ) : null}
          <span className="text-xs text-muted-foreground">
            <HotkeyText command={source.commentCommand} /> to comment
          </span>
          <Button
            type="button"
            className="h-8 px-3.5 text-[13px] font-semibold"
            disabled={!canPost}
            onClick={() => void submit()}
          >
            {post.loading ? "Posting…" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CommentRow({
  entry,
  person,
}: {
  entry: ActivityEntry
  person: Assignee
}) {
  return (
    <article className="flex items-start gap-3 py-2">
      <div className="flex w-7 shrink-0 justify-center">
        <AssigneeAvatar person={person} />
      </div>
      <div className="flex min-w-0 grow flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className="text-[13px] font-semibold text-foreground">
            {person.full_name || person.name}
          </span>
          <RelativeTime value={entry.creation} />
        </p>
        {/* Frappe sanitises every Comment's HTML when it is saved
            (Comment.validate → sanitize_html), as Desk relies on too. */}
        <div
          className="envision-comment"
          dangerouslySetInnerHTML={{ __html: entry.content ?? "" }}
        />
      </div>
    </article>
  )
}

/** "just now", "5 minutes ago"; the exact time on hover. */
function RelativeTime({ value }: { value: string }) {
  const date = new Date(value)
  return (
    <time dateTime={value} title={format(date, "PPpp")}>
      {differenceInSeconds(new Date(), date) < 60
        ? "just now"
        : formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  )
}

function fallbackPerson(name: string): Assignee {
  return { name, full_name: name, user_image: null }
}
