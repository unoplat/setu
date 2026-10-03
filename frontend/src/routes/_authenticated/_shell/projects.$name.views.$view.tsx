import { createFileRoute, Link } from "@tanstack/react-router"
import { useFrappeGetDoc } from "frappe-react-sdk"

import { ProjectHeader } from "@/components/project-header"
import { ProjectBoard } from "@/components/tasks/project-board"
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

// A Custom View: the Project's Board behind the view's saved filters (Paper:
// CV 03 — View saved and open). The view comes from the list the sidebar and
// the view switcher already load, which holds only this user's own, so a link
// to someone else's view, or to one since deleted, finds nothing here.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/views/$view"
)({
  component: ProjectViewPage,
})

function ProjectViewPage() {
  const { name, view: id } = Route.useParams()
  const { views, error } = useViews(name)
  const view = views?.find((candidate) => candidate.name === id)
  // Keyed by the view, so switching views starts the Board's own state
  // (the filter bar's chips, an open Create Task) afresh.
  if (view) return <ProjectBoard key={view.name} project={name} view={view} />
  return (
    <ViewUnavailable project={name} loading={!views && !error} error={error} />
  )
}

function ViewUnavailable({
  project,
  loading,
  error,
}: {
  project: string
  loading: boolean
  error: ReturnType<typeof useViews>["error"]
}) {
  const { data } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    project
  )
  return (
    <>
      <ProjectHeader
        name={project}
        projectName={data?.project_name ?? project}
        section="Views"
      />
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
              <Button
                variant="outline"
                render={
                  <Link to="/projects/$name" params={{ name: project }} />
                }
              >
                Open All tasks
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </main>
    </>
  )
}
