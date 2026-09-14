import { Skeleton } from "@/components/ui/skeleton"

/** Three placeholder rows while invitable users load (step 2). */
export function MemberListSkeleton() {
  return (
    <div className="divide-y">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex h-16 items-center gap-3 px-3.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="size-5 rounded-sm" />
        </div>
      ))}
    </div>
  )
}
