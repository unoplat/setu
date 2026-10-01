import { createFileRoute } from "@tanstack/react-router"
import { useFrappeGetDoc } from "frappe-react-sdk"

import { ProjectHeader } from "@/components/project-header"
import { ArchivedTaskTable } from "@/components/tasks/archived-task-table"
import { Skeleton } from "@/components/ui/skeleton"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { useArchivedTasks } from "@/lib/tasks"

// Paper: Task Archive 04 — Archived tasks. The Tasks someone archived in this
// project, each restorable with its subtasks until it is deleted for good
// thirty days after archiving. Reached from "Archived" on the Board.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/tasks/archived"
)({
  component: ArchivedTasksPage,
})

function ArchivedTasksPage() {
  const { name } = Route.useParams()
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const projectName = project?.project_name ?? name
  const { data, error, isLoading } = useArchivedTasks(name)
  const tasks = data?.message

  return (
    <>
      <ProjectHeader
        name={name}
        projectName={projectName}
        section="Tasks"
        page={{ title: "Archived", sectionTo: "/projects/$name" }}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-12 sm:py-12">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Archived tasks
            </h1>
            <p className="text-sm text-muted-foreground">
              Each one is deleted for good 30 days after it was archived.
              Restoring a task brings back its subtasks.
            </p>
          </div>
          {isLoading || (!tasks && !error) ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-9 w-80" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : error || !tasks ? (
            <p className="text-sm text-muted-foreground">
              {error
                ? frappeErrorMessage(error)
                : "Archived tasks could not be loaded."}
            </p>
          ) : tasks.length === 0 ? (
            <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              Nothing is archived in {projectName}.
            </p>
          ) : (
            <ArchivedTaskTable project={name} tasks={tasks} />
          )}
        </div>
      </main>
    </>
  )
}
