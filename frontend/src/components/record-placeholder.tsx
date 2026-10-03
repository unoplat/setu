import { Skeleton } from "@/components/ui/skeleton"

/**
 * What a record page (06d, 07d, 09) shows in place of the record: its outline
 * while it loads, or why there is nothing to show.
 */
export function RecordPlaceholder({
  loading,
  withId = false,
  children,
}: {
  loading: boolean
  /** The record's chip has its ID beside it (a milestone, a Task). */
  withId?: boolean
  /** The message once loading is over. */
  children: React.ReactNode
}) {
  return loading ? (
    <div className="flex flex-col gap-4 px-6 pt-10 sm:px-14">
      <Skeleton className={withId ? "h-5 w-40" : "h-5 w-24"} />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-32 w-full max-w-190 rounded-lg" />
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}
