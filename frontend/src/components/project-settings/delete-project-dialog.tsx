import * as React from "react"
import { Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { confirmsDeletion } from "./form"

// Paper: 05a — Delete Project Confirmation and 05b — Delete Refused: Project
// Has Tasks. One dialog, two bodies; which one opens is decided by the page
// (see deleteDialogFor), and the refusal also replaces the confirmation when
// the server turns a delete down because tasks appeared meanwhile.

export type DeleteDialogKind = "confirm" | "refused" | null

export function DeleteProjectDialog({
  kind,
  projectName,
  deleting,
  error,
  onCancel,
  onConfirm,
  onOpenTasks,
}: {
  kind: DeleteDialogKind
  projectName: string
  deleting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
  onOpenTasks: () => void
}) {
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(next, details) => {
        if (next) return
        // Never drop an in-flight delete, whatever asked for the close.
        if (deleting) {
          details.cancel()
          return
        }
        onCancel()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-6 rounded-3xl p-7 sm:max-w-[480px]"
      >
        {kind === "refused" ? (
          <RefusedBody
            projectName={projectName}
            onClose={onCancel}
            onOpenTasks={onOpenTasks}
          />
        ) : (
          <ConfirmBody
            projectName={projectName}
            deleting={deleting}
            error={error}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DialogIcon({ tone }: { tone: "destructive" | "muted" }) {
  return (
    <div
      className={cn(
        "flex size-10 items-center justify-center rounded-[12px]",
        tone === "destructive"
          ? "bg-destructive/12 text-destructive"
          : "bg-foreground/6 text-muted-foreground"
      )}
    >
      <Trash2Icon className="size-4.5" strokeWidth={1.8} />
    </div>
  )
}

function ConfirmBody({
  projectName,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  projectName: string
  deleting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = React.useState("")
  const confirmed = confirmsDeletion(typed, projectName)
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (confirmed && !deleting) onConfirm()
      }}
    >
      <DialogHeader className="gap-3.5">
        <DialogIcon tone="destructive" />
        <div className="flex flex-col gap-2">
          <DialogTitle className="text-[22px] leading-7.5 font-semibold tracking-tight">
            Delete {projectName}?
          </DialogTitle>
          <DialogDescription className="leading-5.5">
            This permanently deletes {projectName} for everyone. It cannot be
            undone.
          </DialogDescription>
        </div>
      </DialogHeader>
      <Field className="gap-2" data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="delete-project-confirm">
          Type “{projectName}” to confirm
        </FieldLabel>
        <Input
          id="delete-project-confirm"
          autoComplete="off"
          autoFocus
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={deleting}
          className="h-11 rounded-xl bg-background focus-visible:border-destructive focus-visible:ring-destructive/15"
        />
        <FieldError>{error}</FieldError>
      </Field>
      <DialogFooter className="gap-2.5 pt-1">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={deleting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="lg"
          className="bg-destructive px-4.5 font-semibold text-background hover:bg-destructive/90"
          disabled={!confirmed || deleting}
        >
          Delete project
        </Button>
      </DialogFooter>
    </form>
  )
}

function RefusedBody({
  projectName,
  onClose,
  onOpenTasks,
}: {
  projectName: string
  onClose: () => void
  onOpenTasks: () => void
}) {
  return (
    <>
      <DialogHeader className="gap-3.5">
        <DialogIcon tone="muted" />
        <div className="flex flex-col gap-2">
          <DialogTitle className="text-[22px] leading-7.5 font-semibold tracking-tight">
            Can’t delete {projectName} yet
          </DialogTitle>
          <DialogDescription className="leading-5.5">
            This project still has tasks and subtasks. Move or delete them, then
            try again.
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogFooter className="gap-2.5 pt-1">
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Close
        </Button>
        <Button
          type="button"
          size="lg"
          className="px-4.5 font-semibold"
          onClick={onOpenTasks}
        >
          Open tasks
        </Button>
      </DialogFooter>
    </>
  )
}
