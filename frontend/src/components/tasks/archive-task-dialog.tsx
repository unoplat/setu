import { useNavigate } from "@tanstack/react-router"
import { useFrappePostCall, useSWRConfig } from "frappe-react-sdk"
import { ArchiveIcon, CornerDownRightIcon } from "lucide-react"
import { toast } from "sonner"

import {
  ConfirmDialog,
  ConfirmFooter,
  ConfirmHeader,
  ConfirmImpact,
} from "@/components/confirm-dialog"
import { plural } from "@/lib/confirm-count"
import { milestonesKey } from "@/lib/milestones"
import {
  archivedTasksKey,
  projectTasksKey,
  taskActivityKey,
  taskKey,
  useSubtaskCount,
} from "@/lib/tasks"

import { useRestoreTask } from "./use-restore-task"

// Paper: "Archive task journey", Task Archive 02 and 03. A Task is archived,
// not deleted (CONTEXT.md, Archived Task): it and its subtasks leave every
// list for thirty days, can be restored until then, and are deleted after.

export function ArchiveTaskDialog({
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
  const archive = useFrappePostCall<{ message: { subtasks: number } }>(
    "setu.api.task.archive_task"
  )
  const restore = useRestoreTask(project)

  async function confirm() {
    const { message } = await archive.call({ name: task.name })
    // Back to the Board, past the page's leave guard: an archived Task takes
    // no more edits.
    await navigate({
      to: "/projects/$name",
      params: { name: project },
      replace: true,
      ignoreBlocker: true,
    })
    // Dropped, not refetched: the page would only be refused now.
    void mutate(taskKey(task.name), undefined, { revalidate: false })
    void mutate(taskActivityKey(task.name), undefined, { revalidate: false })
    void mutate(projectTasksKey(project))
    void mutate(archivedTasksKey(project))
    void mutate(milestonesKey(project))
    toast(`“${task.subject}” archived`, {
      description: message.subtasks
        ? `With its ${plural(message.subtasks, "subtask")}. Restorable for 30 days.`
        : "Restorable for 30 days.",
      action: { label: "Undo", onClick: () => void restore(task) },
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      onConfirm={confirm}
    >
      <ArchiveTaskBody task={task} />
    </ConfirmDialog>
  )
}

/** Mounted only while the confirm is open, so the count is always fresh. */
function ArchiveTaskBody({
  task,
}: {
  task: { name: string; subject: string }
}) {
  const count = useSubtaskCount(task.name)
  const subtasks = count.value?.subtasks
  return (
    <>
      <ConfirmHeader
        tone="neutral"
        icon={<ArchiveIcon />}
        title={`Archive “${task.subject}”?`}
        description="It leaves the board, My tasks and every list. You can restore it from Archived for 30 days. After that it’s deleted for good."
      />
      <ConfirmImpact
        icon={<CornerDownRightIcon />}
        text={
          subtasks === undefined
            ? undefined
            : subtasks === 0
              ? "It has no subtasks"
              : `${plural(subtasks, "subtask")} ${subtasks === 1 ? "is" : "are"} archived with it`
        }
        error={count.error}
        onRetry={count.retry}
      />
      <ConfirmFooter
        tone="neutral"
        label="Archive task"
        pendingLabel="Archiving…"
        ready={subtasks !== undefined}
      />
    </>
  )
}
