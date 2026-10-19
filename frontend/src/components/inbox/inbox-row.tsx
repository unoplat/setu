import { Link } from "@tanstack/react-router"
import { CheckIcon, UserIcon } from "lucide-react"

import { RelativeTime } from "@/components/relative-time"
import { TaskStatusIcon } from "@/components/tasks/task-status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { initials } from "@/lib/assignees"
import {
  inboxLink,
  type InboxItem,
  type InboxPerson,
  type InboxRecord,
  type InboxRecordKind,
} from "@/lib/inbox"
import { boardColumnOf } from "@/lib/tasks"
import { cn } from "@/lib/utils"

// Paper 10c, "Record Row", drawn one row per notification rather than one per
// record: the unread dot's slot, the actor's avatar, the record's title with
// the notification's type, Frappe's sentence, a mention's excerpt and the
// record's meta, then the time and, on an unread row, "Read".
//
// The record's title is the row's link, stretched over the whole row by its
// ::after, so the row opens the record wherever it is clicked. "Read" sits
// above that overlay as the link's sibling, never inside it, and stays in the
// tab order: hidden until the row is hovered or either is focused, shown
// always on touch screens.

const KIND_LABELS: Record<InboxRecordKind, string> = {
  task: "Task",
  milestone: "Milestone",
  module: "Module",
  link: "Link",
  project: "Project",
}

export function InboxRow({
  item,
  onMarkRead,
}: {
  item: InboxItem
  /** Marks every row of the item's record read. */
  onMarkRead: (record: InboxRecord) => void
}) {
  const { record, read } = item
  const link = inboxLink(record)
  return (
    <Item
      role="listitem"
      className={cn(
        "relative flex-nowrap items-start gap-3.5 rounded-lg px-3 py-3.5 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
        !read && "bg-card",
        link && (read ? "hover:bg-muted/50" : "hover:bg-muted")
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-2 shrink-0 items-center justify-center"
      >
        {read ? null : (
          <span className="size-2 rounded-full bg-sidebar-primary" />
        )}
      </span>
      <ItemMedia>
        <ActorAvatar person={item.actor} read={read} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {record.title === null ? (
            <span className="truncate text-subtitle text-muted-foreground">
              Deleted item
            </span>
          ) : (
            <RecordTitle read={read} title={record.title} link={link} />
          )}
          <TypeTag type={item.type} read={read} />
        </div>
        <p className="truncate text-compact text-muted-foreground">
          {item.summary}
        </p>
        {item.excerpt === null ? null : (
          <blockquote
            className={cn(
              "line-clamp-2 border-s-2 border-border py-0.5 ps-2.5 text-compact",
              read ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {item.excerpt}
          </blockquote>
        )}
        <RecordMeta record={record} />
      </ItemContent>
      <ItemActions className="w-22 shrink-0 flex-col items-end gap-1">
        <span className="text-xs/5 whitespace-nowrap text-muted-foreground">
          <RelativeTime value={item.creation} />
        </span>
        {read ? null : (
          <span className="relative z-10 opacity-0 group-hover/item:opacity-100 group-has-[a:focus-visible]/item:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onMarkRead(record)}
            >
              <CheckIcon />
              Read
            </Button>
          </span>
        )}
      </ItemActions>
    </Item>
  )
}

/** The headline, as the row's link when the record can still be opened. */
function RecordTitle({
  title,
  read,
  link,
}: {
  title: string
  read: boolean
  link: ReturnType<typeof inboxLink>
}) {
  const className = cn(
    "truncate text-subtitle",
    read ? "font-medium text-muted-foreground" : "font-semibold text-foreground"
  )
  if (!link) return <span className={className}>{title}</span>
  return (
    <Link
      {...link}
      className={cn(
        className,
        "outline-none after:absolute after:inset-0 after:rounded-lg"
      )}
    >
      {title}
    </Link>
  )
}

/** 10c's 32px avatar: the person's picture, or their initials. */
function ActorAvatar({
  person,
  read,
}: {
  person: InboxPerson | null
  read: boolean
}) {
  return (
    <Avatar>
      {person?.user_image ? (
        <AvatarImage src={person.user_image} alt="" />
      ) : null}
      <AvatarFallback
        className={cn(
          "text-meta font-semibold",
          read ? "text-muted-foreground" : "bg-input text-foreground"
        )}
      >
        {person ? (
          initials({ ...person, full_name: person.full_name ?? "" })
        ) : (
          <UserIcon className="size-4" />
        )}
      </AvatarFallback>
    </Avatar>
  )
}

/** "Assignment", "@ you" for a mention, otherwise Frappe's own type. */
function TypeTag({ type, read }: { type: string; read: boolean }) {
  const mention = type === "Mention"
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-md px-1.5 text-meta font-semibold",
        mention && !read
          ? "bg-sidebar-primary/18 text-sidebar-primary"
          : "text-muted-foreground"
      )}
    >
      {mention ? "@ you" : type}
    </Badge>
  )
}

/**
 * The Task's or milestone's Status with its Board icon, then the record's
 * kind and its Project, as "Open · Task · Customer Portal".
 */
function RecordMeta({ record }: { record: InboxRecord }) {
  const status =
    record.kind === "task" || record.kind === "milestone" ? record.status : null
  const column = status ? boardColumnOf(status) : undefined
  const parts = [status, KIND_LABELS[record.kind], record.project_title].filter(
    (part): part is string => Boolean(part)
  )
  return (
    <div className="flex min-w-0 items-center gap-1.5 pt-0.5 text-compact text-muted-foreground">
      {column ? <TaskStatusIcon column={column} className="size-3.5" /> : null}
      <span className="truncate">{parts.join(" · ")}</span>
    </div>
  )
}

/** A row's outline while the first page loads. */
export function InboxRowSkeleton() {
  return (
    <div className="flex items-start gap-3.5 px-3 py-3.5">
      <span className="w-2 shrink-0" />
      <Skeleton className="size-8 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="h-4 w-14 shrink-0" />
    </div>
  )
}
