import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useFrappeGetDoc } from "frappe-react-sdk"
import { PlusIcon } from "lucide-react"

import { CreateMilestoneSheet } from "@/components/milestones/create-milestone-sheet"
import { MilestoneTable } from "@/components/milestones/milestone-table"
import { MilestonesEmpty } from "@/components/milestones/milestones-empty"
import { ProjectHeader } from "@/components/project-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { useMilestones } from "@/lib/milestones"

// Paper: 06 — Empty Milestones, the Create Milestone panel (06a/06b) from
// the "Create milestone journey", and 06c — the table of existing milestones.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/milestones/"
)({
  component: MilestonesPage,
})

function MilestonesPage() {
  const { name } = Route.useParams()
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const projectName = project?.project_name ?? name
  const { data, error, isLoading, mutate } = useMilestones(name)
  const [creating, setCreating] = React.useState(false)
  const milestones = data?.message

  return (
    <>
      <ProjectHeader name={name} projectName={projectName} section="Milestones">
        <Button
          className="h-9 px-3.5 font-semibold"
          onClick={() => setCreating(true)}
        >
          <PlusIcon data-icon="inline-start" />
          New milestone
        </Button>
      </ProjectHeader>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {isLoading || (!milestones && !error) ? (
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 sm:px-12 sm:py-12">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-80" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : error || !milestones ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {error
              ? frappeErrorMessage(error)
              : "Milestones could not be loaded."}
          </div>
        ) : milestones.length === 0 ? (
          <MilestonesEmpty
            projectName={projectName}
            onCreate={() => setCreating(true)}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-12 sm:py-12">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                Milestones
              </h1>
              <p className="text-sm text-muted-foreground">
                Checkpoints {projectName} is working toward.
              </p>
            </div>
            <MilestoneTable milestones={milestones} />
          </div>
        )}
      </main>
      <CreateMilestoneSheet
        open={creating}
        onOpenChange={setCreating}
        project={name}
        projectName={projectName}
        onCreated={() => mutate()}
      />
    </>
  )
}
