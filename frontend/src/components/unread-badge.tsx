/**
 * The Inbox's unread count as a pill (Paper: 10c — Inbox), read out as
 * "3 unread" rather than a bare number. Used by the sidebar's Inbox item and
 * the phone tab bar.
 */
export function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-xs font-medium text-sidebar-primary-foreground tabular-nums">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{count} unread</span>
    </span>
  )
}
