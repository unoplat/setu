import { createFileRoute, Link } from "@tanstack/react-router"

import { MyTasksHeader } from "@/components/my-tasks-header"
import { MyTasksBoard } from "@/components/tasks/my-tasks-board"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { BOARD_COLUMNS } from "@/lib/tasks"
import { useViews } from "@/lib/views"

// A My tasks view: the My tasks Board behind the view's saved filters (Paper:
// My Tasks 07 — Views: saved view open). As a Project's views
// (projects.$name.views.$view.tsx), it comes from the list the sidebar and the
// view switcher already load, which holds only this user's own, so a link to
// someone else's view, or to one since deleted, finds nothing here.
export const Route = createFileRoute(
  "/_authenticated/_shell/my-tasks/views/$view"
)({
  component: MyTasksViewPage,
})

function MyTasksViewPage() {
  const { view: id } = Route.useParams()
  const { views, error } = useViews(null)
  const view = views?.find((candidate) => candidate.name === id)
  // Keyed by the view, so switching views starts the Board's own state (the
  // filter bar's chips) afresh.
  if (view) return <MyTasksBoard key={view.name} view={view} />
  return <ViewUnavailable loading={!views && !error} error={error} />
}

function ViewUnavailable({
  loading,
  error,
}: {
  loading: boolean
  error: ReturnType<typeof useViews>["error"]
}) {
  return (
    <>
      <MyTasksHeader page="Views" />
      <main className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-6">
            {BOARD_COLUMNS.map((column) => (
              <Skeleton key={column.id} className="h-full w-80 shrink-0" />
            ))}
          </div>
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyTitle>
                {error ? "This view could not be opened" : "This view is gone"}
              </EmptyTitle>
              <EmptyDescription>
                {error
                  ? frappeErrorMessage(error)
                  : "It was deleted, or it belongs to someone else. Views are private to the person who saved them."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" render={<Link to="/my-tasks" />}>
                Open All my tasks
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </main>
    </>
  )
}
