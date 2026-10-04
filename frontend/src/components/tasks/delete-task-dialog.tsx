import { useNavigate } from "@tanstack/react-router"
import { useFrappePostCall, useSWRConfig } from "frappe-react-sdk"
import { CornerDownRightIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  ConfirmDialog,
  ConfirmFooter,
  ConfirmHeader,
  ConfirmImpact,
} from "@/components/confirm-dialog"
import { plural } from "@/lib/confirm-count"
import { isMilestoneProgressKey } from "@/lib/milestones"
import { modulesKey } from "@/lib/modules"
import {
  projectTasksKey,
  taskActivityKey,
  taskKey,
  useSubtaskCount,
} from "@/lib/tasks"

/** Permanently deletes the Task and every descendant, with no recovery. */
export function DeleteTaskDialog({
  project,
  task,
  open,
  onOpenChange,
  finalFocus,
}: {
  project: string
  task: { name: string; subject: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: React.RefObject<HTMLElement | null>
}) {
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()
  const remove = useFrappePostCall<{
    message: { name: string; subject: string; subtasks: number }
  }>("setu.api.task.delete_task")

  async function confirm() {
    const { message } = await remove.call({ name: task.name })
    // Leave before clearing the cache, past the unsaved-edits guard: there
    // is no longer a Task to save to.
    await navigate({
      to: "/projects/$name",
      params: { name: project },
      replace: true,
      ignoreBlocker: true,
    })
    // Dropped, not refetched: refetching the deleted Task only fails.
    void mutate(taskKey(task.name), undefined, { revalidate: false })
    void mutate(taskActivityKey(task.name), undefined, { revalidate: false })
    void mutate(projectTasksKey(project))
    void mutate(isMilestoneProgressKey)
    void mutate(modulesKey(project))
    toast.success(`“${message.subject}” deleted`, {
      description: message.subtasks
        ? `Its ${plural(message.subtasks, "subtask")} ${message.subtasks === 1 ? "was" : "were"} also permanently deleted.`
        : undefined,
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      onConfirm={confirm}
    >
      <DeleteTaskBody task={task} />
    </ConfirmDialog>
  )
}

/** Mounted only while the confirm is open, so the count is always fresh. */
function DeleteTaskBody({ task }: { task: { name: string; subject: string } }) {
  const count = useSubtaskCount(task.name)
  const subtasks = count.value?.subtasks
  return (
    <>
      <ConfirmHeader
        tone="destructive"
        icon={<Trash2Icon />}
        title={`Delete “${task.subject}”?`}
        description="The task, all its subtasks and their comments are permanently deleted for everyone immediately. This can’t be undone."
      />
      <ConfirmImpact
        icon={<CornerDownRightIcon />}
        text={
          subtasks === undefined
            ? undefined
            : subtasks === 0
              ? "It has no subtasks"
              : `${plural(subtasks, "subtask")} ${subtasks === 1 ? "is" : "are"} permanently deleted with it, including nested subtasks`
        }
        error={count.error}
        onRetry={count.retry}
      />
      <ConfirmFooter
        tone="destructive"
        label="Delete task"
        pendingLabel="Deleting…"
        ready={subtasks !== undefined && !count.error}
      />
    </>
  )
}
