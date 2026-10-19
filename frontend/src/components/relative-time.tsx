import {
  differenceInSeconds,
  format,
  formatDistanceToNowStrict,
} from "date-fns"

/**
 * "just now", "5 minutes ago"; the exact time on hover. Shared by a record's
 * timeline (record-activity.tsx) and the Inbox's rows.
 */
export function RelativeTime({ value }: { value: string }) {
  const date = new Date(value)
  return (
    <time dateTime={value} title={format(date, "PPpp")}>
      {differenceInSeconds(new Date(), date) < 60
        ? "just now"
        : formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  )
}
