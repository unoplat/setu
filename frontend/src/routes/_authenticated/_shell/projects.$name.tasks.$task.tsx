import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  useFrappeGetDoc,
  useFrappePostCall,
  useSWRConfig,
} from "frappe-react-sdk"

import { type PublishTarget } from "@/components/github/publish-dialog"
import { useGitHubTagConfirm } from "@/components/github/use-github-tag-confirm"
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
import { TaskGitHubPanel } from "@/components/tasks/task-github"
import { SubtasksSection } from "@/components/tasks/subtasks-section"
import { TaskForm } from "@/components/tasks/task-form"
import { useAutosaveForm } from "@/lib/autosave"
import { useCommand, useScope, useScopeStack } from "@/lib/commands"
import { frappeErrorMessage, frappeExceptionType } from "@/lib/frappe-error"
import { taskGitHubKey, useTaskGitHub } from "@/lib/github"
import { useMarkRecordRead } from "@/lib/inbox"
import { isMilestoneProgressKey } from "@/lib/milestones"
import {
  MY_TASKS_KEY,
  TAGS_KEY,
  boardStatus,
  descendantsOf,
  projectTasksKey,
  taskActivityKey,
  useProjectTasks,
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
  // Opening it marks its Inbox items read (lib/inbox.ts).
  useMarkRecordRead("task", taskName)
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
      // site's list; My tasks lists the Tasks assigned to the signed-in user.
      void revalidate(projectTasksKey(project))
      void revalidate(isMilestoneProgressKey)
      void revalidate(taskActivityKey(task.name))
      // A tag can publish it, and a synced field queues a sync to GitHub.
      void revalidate(taskGitHubKey(task.name))
      if (changes.tags) void revalidate(TAGS_KEY)
      if (changes.assignees) void revalidate(MY_TASKS_KEY)
      return taskValues(response.message)
    },
  })
  const { form, flush } = autosave

  // Adding the github tag publishes the Task when its Project syncs, so it
  // asks first (components/github/publish-dialog). Until the Task's GitHub
  // state has loaded, it asks without knowing the repository.
  const github = useTaskGitHub(task.name)
  const { data: projectTasks } = useProjectTasks(project)
  const publishTarget = React.useMemo<PublishTarget | null>(() => {
    const view = github.data?.message
    if (!view) return { repository: null, subtasks: 0 }
    if (view.link || !view.eligible || !view.route.sync_enabled) return null
    return {
      repository: view.route.repository,
      subtasks: projectTasks ? descendantsOf(projectTasks, task.name).size : 0,
    }
  }, [github.data, projectTasks, task.name])
  const { confirmTags, dialog: publishDialog } =
    useGitHubTagConfirm(publishTarget)

  // A Task the Board leaves off (Cancelled in Desk) has no column to pick, so
  // it is shown, not edited.
  const canWrite = task.can_write && boardStatus(task.status) !== null
  useScope("task")
  // In the Subtasks' inline row the same keys open Create subtask instead.
  const addingSubtask = useScopeStack().includes("subtask-row")
  useCommand("task.toggleDescription", () => setExpanded((value) => !value), {
    enabled: canWrite && !addingSubtask,
  })
  useCommand("task.collapseDescription", () => setExpanded(false), {
    enabled: expanded,
  })
  useCommand("task.save", () => void flush(), { enabled: canWrite })

  // 09k: the Subtasks between the description and the comments.
  const footer = (
    <>
      <SubtasksSection
        project={project}
        projectName={projectName}
        task={task}
        canAdd={canWrite}
      />
      <TaskComments task={task} />
    </>
  )
  const activity = (
    <>
      <TaskGitHubPanel task={task.name} project={project} />
      <TaskActivityLog task={task} />
    </>
  )

  return (
    <>
      <ProjectHeader
        name={project}
        projectName={projectName}
        section="Tasks"
        page={{ title: task.subject, sectionTo: "/projects/$name" }}
        ancestors={task.ancestors}
      >
        <TaskActions
          project={project}
          task={task}
          canDelete={task.can_delete}
        />
      </ProjectHeader>
      <main className="flex min-h-0 flex-1 flex-col">
        {canWrite ? (
          <TaskForm
            form={form}
            task={task}
            project={project}
            listeners={autosave.listeners}
            confirmTags={confirmTags}
            status={autosave.status}
            descriptionRevision={autosave.replaced.description ?? 0}
            descriptionConflict={
              autosave.conflicts.includes("description")
                ? (choice) => autosave.resolveConflicts(choice, ["description"])
                : null
            }
            indicator={
              <SaveIndicator
                status={autosave.status}
                error={autosave.error}
                savedAt={autosave.savedAt}
                onRetry={() => void flush()}
                onResolve={(choice) => autosave.resolveConflicts(choice)}
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
        conflict={autosave.status === "conflict"}
      />
      {publishDialog}
    </>
  )
}
