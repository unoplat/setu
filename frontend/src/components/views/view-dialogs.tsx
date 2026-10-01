import * as React from "react"
import { useMatchRoute, useNavigate } from "@tanstack/react-router"
import {
  useFrappePostCall,
  useSWRConfig,
  type FrappeError,
} from "frappe-react-sdk"
import { SquareCheckIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  ConfirmDialog,
  ConfirmFooter,
  ConfirmHeader,
  ConfirmImpact,
} from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  closeDeleteView,
  closeRenameView,
  useDeletingView,
  useRenamingView,
  type ViewTarget,
} from "@/components/views/store"
import { plural } from "@/lib/confirm-count"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { filterTasks } from "@/lib/task-filters"
import { useProjectTasks } from "@/lib/tasks"
import { useViews, viewsKey } from "@/lib/views"

// Paper: CV 06 — View actions menu, CV 07 — Confirm delete view. The rename
// and delete dialogs for Custom Views, one pair for the whole app (store.ts).
export function ViewDialogs() {
  const renaming = useRenamingView()
  const deleting = useDeletingView()
  // Each keeps its last target while it closes, so the text does not vanish
  // mid-animation.
  const renameTarget = useLast(renaming)
  const deleteTarget = useLast(deleting)
  return (
    <>
      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) closeRenameView()
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {renameTarget ? (
            <RenameViewForm
              key={renameTarget.view.name}
              target={renameTarget}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {deleteTarget ? (
        <DeleteViewDialog target={deleteTarget} open={deleting !== null} />
      ) : null}
    </>
  )
}

function useLast<T>(value: T | null): T | null {
  const [last, setLast] = React.useState(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}

function RenameViewForm({ target }: { target: ViewTarget }) {
  const id = React.useId()
  const { mutate } = useSWRConfig()
  const [name, setName] = React.useState(target.view.view_name)
  const [error, setError] = React.useState<string | null>(null)
  const { call, loading } = useFrappePostCall<{ message: unknown }>(
    "setu.api.view.update_view"
  )
  const trimmed = name.trim()

  async function rename(event: React.FormEvent) {
    event.preventDefault()
    if (loading || !trimmed) return
    if (trimmed === target.view.view_name) {
      closeRenameView()
      return
    }
    setError(null)
    try {
      await call({ name: target.view.name, view_name: trimmed })
      await mutate(viewsKey(target.project))
      closeRenameView()
    } catch (caught) {
      setError(frappeErrorMessage(caught as FrappeError))
    }
  }

  return (
    <form onSubmit={(event) => void rename(event)} className="contents">
      <DialogHeader>
        <DialogTitle>Rename view</DialogTitle>
        <DialogDescription>
          Only the name changes. The view keeps its filters.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Name</Label>
        <Input
          id={id}
          autoFocus
          autoComplete="off"
          maxLength={140}
          value={name}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={closeRenameView}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !trimmed}>
          {loading ? "Renaming…" : "Rename"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function DeleteViewDialog({
  target,
  open,
}: {
  target: ViewTarget
  open: boolean
}) {
  const { project, view } = target
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const { mutate } = useSWRConfig()
  const remove = useFrappePostCall<{ message: { name: string } }>(
    "setu.api.view.delete_view"
  )

  async function confirm() {
    await remove.call({ name: view.name })
    // Off the view first, if it is the one open: its page has nothing left
    // to show once the list no longer holds it.
    const viewing = matchRoute({
      to: "/projects/$name/views/$view",
      params: { name: project, view: view.name },
    })
    if (viewing) {
      await navigate({
        to: "/projects/$name",
        params: { name: project },
        replace: true,
      })
    }
    await mutate(viewsKey(project))
    toast.success(`“${view.view_name}” deleted`, {
      description: "Your tasks and the board are as they were.",
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDeleteView()
      }}
      onConfirm={confirm}
    >
      <DeleteViewBody target={target} />
    </ConfirmDialog>
  )
}

/** Mounted only while the confirm is open, so the count is of the Board now. */
function DeleteViewBody({ target }: { target: ViewTarget }) {
  const { project, view } = target
  const { data: tasks, error, mutate } = useProjectTasks(project)
  const { views } = useViews(project)
  const filters = views?.find((v) => v.name === view.name)?.filters
  const shown =
    tasks && filters ? filterTasks(tasks, filters).length : undefined
  return (
    <>
      <ConfirmHeader
        tone="destructive"
        icon={<Trash2Icon />}
        title={`Delete “${view.view_name}”?`}
        description="Only the saved view is removed. Nothing else changes."
      />
      <ConfirmImpact
        icon={<SquareCheckIcon />}
        text={
          shown === undefined
            ? undefined
            : shown === 0
              ? "It shows no tasks right now"
              : `The ${plural(shown, "task")} it shows stay on All tasks, untouched`
        }
        error={error ?? undefined}
        onRetry={() => void mutate()}
      />
      <ConfirmFooter
        tone="destructive"
        label="Delete view"
        pendingLabel="Deleting…"
        // The count is a reassurance, not a condition: a view whose filters
        // cannot be counted can still be deleted.
        ready
      />
    </>
  )
}
