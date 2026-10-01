import { useNavigate } from "@tanstack/react-router"
import { useFrappePostCall, useSWRConfig } from "frappe-react-sdk"
import { SquareCheckIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  ConfirmDialog,
  ConfirmFooter,
  ConfirmHeader,
  ConfirmImpact,
} from "@/components/confirm-dialog"
import { plural } from "@/lib/confirm-count"
import {
  milestoneActivityKey,
  milestoneKey,
  milestonesKey,
  useLinkedTaskCount,
} from "@/lib/milestones"
import { projectTasksKey } from "@/lib/tasks"

// Paper: "Delete milestone journey", Milestone Delete 02 and 03. Deleting is
// for good; the milestone's Tasks stay on the Board with no milestone.

export function DeleteMilestoneDialog({
  project,
  milestone,
  open,
  onOpenChange,
  finalFocus,
}: {
  project: string
  milestone: { name: string; subject: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: React.RefObject<HTMLElement | null>
}) {
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()
  const remove = useFrappePostCall<{ message: { tasks: number } }>(
    "setu.api.milestone.delete_milestone"
  )

  async function confirm() {
    const { message } = await remove.call({ name: milestone.name })
    // Off the page first, past its leave guard: an edit still waiting to
    // save has nothing left to save to.
    await navigate({
      to: "/projects/$name/milestones",
      params: { name: project },
      replace: true,
      ignoreBlocker: true,
    })
    // Dropped, not refetched: refetching a deleted milestone only fails.
    void mutate(milestoneKey(milestone.name), undefined, { revalidate: false })
    void mutate(milestoneActivityKey(milestone.name), undefined, {
      revalidate: false,
    })
    void mutate(milestonesKey(project))
    void mutate(projectTasksKey(project))
    toast.success(`“${milestone.subject}” deleted`, {
      description: message.tasks
        ? `Its ${plural(message.tasks, "task")} stay on the board, with no milestone.`
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
      <DeleteMilestoneBody milestone={milestone} />
    </ConfirmDialog>
  )
}

/** Mounted only while the confirm is open, so the count is always fresh. */
function DeleteMilestoneBody({
  milestone,
}: {
  milestone: { name: string; subject: string }
}) {
  const count = useLinkedTaskCount(milestone.name)
  const tasks = count.value?.tasks
  return (
    <>
      <ConfirmHeader
        tone="destructive"
        icon={<Trash2Icon />}
        title={`Delete “${milestone.subject}”?`}
        description="The milestone, its description and its comments are deleted for everyone. This can’t be undone."
      />
      <ConfirmImpact
        icon={<SquareCheckIcon />}
        text={
          tasks === undefined
            ? undefined
            : tasks === 0
              ? "No tasks are linked to it"
              : `${plural(tasks, "linked task")} stay, with no milestone`
        }
        error={count.error}
        onRetry={count.retry}
      />
      <ConfirmFooter
        tone="destructive"
        label="Delete milestone"
        pendingLabel="Deleting…"
        ready={tasks !== undefined}
      />
    </>
  )
}
