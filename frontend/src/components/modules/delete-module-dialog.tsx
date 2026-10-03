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
  moduleActivityKey,
  moduleKey,
  modulesKey,
  useModuleTaskCount,
} from "@/lib/modules"
import { projectTasksKey } from "@/lib/tasks"

// Paper: "Delete module journey", Module Delete 02 and 03. Deleting is for
// good; the module's Tasks stay on the Board, under No module.

export function DeleteModuleDialog({
  project,
  module,
  open,
  onOpenChange,
  finalFocus,
}: {
  project: string
  module: { name: string; module_name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: React.RefObject<HTMLElement | null>
}) {
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()
  const remove = useFrappePostCall<{ message: { tasks: number } }>(
    "setu.api.module.delete_module"
  )

  async function confirm() {
    const { message } = await remove.call({ name: module.name })
    // Off the page first, past its leave guard: an edit still waiting to
    // save has nothing left to save to.
    await navigate({
      to: "/projects/$name/modules",
      params: { name: project },
      replace: true,
      ignoreBlocker: true,
    })
    // Dropped, not refetched: refetching a deleted module only fails.
    void mutate(moduleKey(module.name), undefined, { revalidate: false })
    void mutate(moduleActivityKey(module.name), undefined, {
      revalidate: false,
    })
    void mutate(modulesKey(project))
    void mutate(projectTasksKey(project))
    toast.success(`“${module.module_name}” deleted`, {
      description: message.tasks
        ? `Its ${plural(message.tasks, "task")} stay on the board, under No module.`
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
      <DeleteModuleBody module={module} />
    </ConfirmDialog>
  )
}

/** Mounted only while the confirm is open, so the count is always fresh. */
function DeleteModuleBody({
  module,
}: {
  module: { name: string; module_name: string }
}) {
  const count = useModuleTaskCount(module.name)
  const tasks = count.value?.tasks
  return (
    <>
      <ConfirmHeader
        tone="destructive"
        icon={<Trash2Icon />}
        title={`Delete “${module.module_name}”?`}
        description="The module, its description and its comments are deleted for everyone. This can’t be undone."
      />
      <ConfirmImpact
        icon={<SquareCheckIcon />}
        text={
          tasks === undefined
            ? undefined
            : tasks === 0
              ? "No tasks are filed under it"
              : `${plural(tasks, "task")} stay, under No module`
        }
        error={count.error}
        onRetry={count.retry}
      />
      <ConfirmFooter
        tone="destructive"
        label="Delete module"
        pendingLabel="Deleting…"
        ready={tasks !== undefined}
      />
    </>
  )
}
