import * as React from "react"
import { useSWRConfig } from "frappe-react-sdk"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { isMilestoneProgressKey } from "@/lib/milestones"
import { projectTasksKey, useRelatedTasks, type TaskLink } from "@/lib/tasks"

import { CreateTaskSheet } from "./create-task-sheet"
import { LinkedTaskTable } from "./linked-task-table"

/**
 * Paper 06d "Linked tasks" and 07d "Tasks": the Tasks behind the record's
 * progress, in the filterable table of 06f and 07f (each row opening its own
 * page), and Add task with the link filled in.
 */
export function RelatedTasks({
  project,
  projectName,
  heading,
  link,
  emptyTitle,
  emptyText,
  canAdd,
}: {
  /** The Project's name (its id). */
  project: string
  projectName: string
  heading: string
  link: TaskLink
  emptyTitle: string
  emptyText: string
  canAdd: boolean
}) {
  const { mutate } = useSWRConfig()
  const { tasks, total, loading } = useRelatedTasks(project, link)
  const [adding, setAdding] = React.useState(false)

  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{heading}</h2>
          {loading ? null : (
            <span className="text-xs text-muted-foreground tabular-nums">
              {total}
            </span>
          )}
        </div>
        {canAdd ? (
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1.5 rounded-md border-input px-3 text-compact"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="size-3.5" />
            Add task
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-7 w-1/2" />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-input px-4 py-5 text-center">
          <p className="text-sm font-medium">{emptyTitle}</p>
          <p className="text-compact text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <LinkedTaskTable project={project} tasks={tasks} />
      )}

      {canAdd ? (
        <CreateTaskSheet
          open={adding}
          onOpenChange={setAdding}
          project={project}
          projectName={projectName}
          status="Open"
          milestone={"milestone" in link ? link.milestone : undefined}
          module={"module" in link ? link.module : undefined}
          // A new Task changes the list here and its milestone's progress.
          onCreated={() =>
            Promise.all([
              mutate(projectTasksKey(project)),
              mutate(isMilestoneProgressKey),
            ])
          }
        />
      ) : null}
    </section>
  )
}
