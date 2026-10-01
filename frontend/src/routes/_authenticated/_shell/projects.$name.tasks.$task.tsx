import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  useFrappeGetDoc,
  useFrappePostCall,
  useSWRConfig,
} from "frappe-react-sdk"

import { ProjectHeader } from "@/components/project-header"
import { SaveIndicator, UnsavedEditsDialog } from "@/components/record-detail"
import { RecordPlaceholder } from "@/components/record-placeholder"
import { prepareTask, taskValues } from "@/components/tasks/form"
import { TaskActions } from "@/components/tasks/task-actions"
import {
  TaskActivityLog,
  TaskComments,
  TaskReadOnly,
} from "@/components/tasks/task-detail"
import { TaskForm } from "@/components/tasks/task-form"
import { useAutosaveForm } from "@/lib/autosave"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage, frappeExceptionType } from "@/lib/frappe-error"
import { milestonesKey } from "@/lib/milestones"
import {
  TAGS_KEY,
  boardStatus,
  projectTasksKey,
  taskActivityKey,
  useTask,
  type TaskDetail,
} from "@/lib/tasks"

// Paper: 09 — Task Detail (card clicked): the title, the description and the
// activity in a centred column, the properties in a rail on the right. Every
// edit saves on its own (lib/autosave); there is no Save. Opened from a Card
// on the Board; the Board is the sibling index route, so Back (or
// "Tasks" in the breadcrumb) returns to it as it was left.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/tasks/$task"
)({
  component: TaskPage,
})

function TaskPage() {
  const { name, task: taskName } = Route.useParams()
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const { data, error, isLoading, mutate } = useTask(taskName)
  // A Task of another project under this project's URL is not "here".
  const task =
    data?.message && data.message.project === name ? data.message : undefined
  const projectName = project?.project_name ?? task?.project_name ?? name

  if (task) {
    // Keyed so another Task starts a fresh form, save queue and composer.
    return (
      <TaskScreen
        key={task.name}
        project={name}
        task={task}
        projectName={projectName}
        replaceTask={(next) => mutate({ message: next }, { revalidate: false })}
      />
    )
  }

  return (
    <>
      <ProjectHeader
        name={name}
        projectName={projectName}
        section="Tasks"
        page={{ title: taskName, sectionTo: "/projects/$name" }}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RecordPlaceholder loading={isLoading || (!data && !error)} withId>
          {error && frappeExceptionType(error) !== "DoesNotExistError"
            ? frappeErrorMessage(error)
            : "This task doesn't exist in this project."}
        </RecordPlaceholder>
      </main>
    </>
  )
}

function TaskScreen({
  project,
  task,
  projectName,
  replaceTask,
}: {
  project: string
  task: TaskDetail
  projectName: string
  replaceTask: (next: TaskDetail) => Promise<unknown>
}) {
  const { mutate: revalidate } = useSWRConfig()
  const [expanded, setExpanded] = React.useState(false)
  const update = useFrappePostCall<{ message: TaskDetail }>(
    "setu.api.task.update_task"
  )

  // The form starts from the saved Task. An edit sends only the fields that
  // differ from it, since the server leaves every field it is not sent alone,
  // so a save here never undoes what someone changed in Desk meanwhile.
  const saved = React.useMemo(() => taskValues(task), [task])
  const autosave = useAutosaveForm({
    saved,
    prepare: prepareTask,
    save: async (changes) => {
      const response = await update.call({ name: task.name, ...changes })
      await replaceTask(response.message)
      // The Board shows every property; a milestone's progress follows its
      // Tasks' Statuses; the timeline logs the change; a new tag joins the
      // site's list.
      void revalidate(projectTasksKey(project))
      void revalidate(milestonesKey(project))
      void revalidate(taskActivityKey(task.name))
      if (changes.tags) void revalidate(TAGS_KEY)
      return taskValues(response.message)
    },
  })
  const { form, flush } = autosave

  // A Task the Board leaves off (Cancelled in Desk) has no column to pick, so
  // it is shown, not edited.
  const canWrite = task.can_write && boardStatus(task.status) !== null
  useScope("task")
  useCommand("task.toggleDescription", () => setExpanded((value) => !value), {
    enabled: canWrite,
  })
  useCommand("task.collapseDescription", () => setExpanded(false), {
    enabled: expanded,
  })
  useCommand("task.save", () => void flush(), { enabled: canWrite })

  const footer = <TaskComments task={task} />
  const activity = <TaskActivityLog task={task} />

  return (
    <>
      <ProjectHeader
        name={project}
        projectName={projectName}
        section="Tasks"
        page={{ title: task.subject, sectionTo: "/projects/$name" }}
      >
        <TaskActions
          project={project}
          task={task}
          canArchive={task.can_write}
        />
      </ProjectHeader>
      <main className="flex min-h-0 flex-1 flex-col">
        {canWrite ? (
          <TaskForm
            form={form}
            task={task}
            project={project}
            listeners={autosave.listeners}
            status={autosave.status}
            indicator={
              <SaveIndicator
                status={autosave.status}
                error={autosave.error}
                savedAt={autosave.savedAt}
                onRetry={() => void flush()}
              />
            }
            expanded={expanded}
            onExpand={() => setExpanded(true)}
            onCollapse={() => setExpanded(false)}
            onSubmit={() => void flush()}
            footer={footer}
            activity={activity}
          />
        ) : (
          <TaskReadOnly
            task={task}
            project={project}
            footer={footer}
            activity={activity}
          />
        )}
      </main>
      <UnsavedEditsDialog
        leaving={autosave.leaving}
        record={task.subject}
        reason={autosave.error}
        saving={autosave.status === "saving"}
      />
    </>
  )
}
