import * as React from "react"
import { Link } from "@tanstack/react-router"
import { useSWRConfig } from "frappe-react-sdk"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatShortDay, milestonesKey } from "@/lib/milestones"
import {
  BOARD_COLUMNS,
  BOARD_PALETTE,
  projectTasksKey,
  useRelatedTasks,
  type TaskLink,
  type TaskSummary,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"

import { CreateTaskSheet } from "./create-task-sheet"
import { StatusRing } from "./task-selects"

function column(task: TaskSummary) {
  return BOARD_COLUMNS.find((item) =>
    (item.statuses as readonly string[]).includes(task.status)
  )
}

/**
 * Paper 06d "Linked tasks" and 07d "Tasks": the Tasks behind the record's
 * progress, each opening its own page, and Add task with the link filled in.
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
            className="h-8 gap-1.5 rounded-md border-input px-3 text-[13px]"
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
          <p className="text-[13px] text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {tasks.map((task) => {
            const status = column(task)
            const color = BOARD_PALETTE.find(
              (swatch) => swatch.id === status?.color
            )?.cssVar
            const done = task.status === "Completed"
            return (
              <li key={task.name}>
                <Link
                  to="/projects/$name/tasks/$task"
                  params={{ name: project, task: task.name }}
                  className="flex min-h-9 items-center gap-2.5 rounded-sm px-2 text-sm transition-colors outline-none hover:bg-foreground/4 focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <StatusRing color={color} />
                  <span
                    className={cn(
                      "min-w-0 grow truncate",
                      done && "text-muted-foreground"
                    )}
                  >
                    {task.subject}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {task.status === "Overdue" ? (
                      <span className="font-medium text-destructive">
                        Overdue
                      </span>
                    ) : done || !task.exp_end_date ? (
                      (status?.title ?? task.status)
                    ) : (
                      `${status?.title ?? task.status} · ${formatShortDay(task.exp_end_date.slice(0, 10))}`
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
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
              mutate(milestonesKey(project)),
            ])
          }
        />
      ) : null}
    </section>
  )
}
