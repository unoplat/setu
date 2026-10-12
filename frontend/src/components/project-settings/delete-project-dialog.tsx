import * as React from "react"
import { Trash2Icon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import { CompactField, FieldInput } from "@/components/app-ui/field-controls"
import {
  PromptDialogContent,
  PromptDialogFooter,
  PromptDialogHeader,
  PromptDialogIcon,
} from "@/components/app-ui/prompt-dialog"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FieldError, FieldLabel } from "@/components/ui/field"

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
      <PromptDialogContent>
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
      </PromptDialogContent>
    </Dialog>
  )
}

function DialogIcon({ tone }: { tone: "destructive" | "muted" }) {
  return (
    <PromptDialogIcon tone={tone}>
      <Trash2Icon strokeWidth={1.8} />
    </PromptDialogIcon>
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
      <PromptDialogHeader
        icon={<DialogIcon tone="destructive" />}
        title={<>Delete {projectName}?</>}
        description={
          <>
            This permanently deletes {projectName} for everyone. It cannot be
            undone.
          </>
        }
      />
      <CompactField data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="delete-project-confirm">
          Type “{projectName}” to confirm
        </FieldLabel>
        <FieldInput
          id="delete-project-confirm"
          autoComplete="off"
          autoFocus
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={deleting}
          className="bg-background focus-visible:border-destructive focus-visible:ring-destructive/15"
        />
        <FieldError>{error}</FieldError>
      </CompactField>
      <PromptDialogFooter>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={deleting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <ActionButton
          type="submit"
          tone="destructive"
          size="lg"
          disabled={!confirmed || deleting}
        >
          Delete project
        </ActionButton>
      </PromptDialogFooter>
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
      <PromptDialogHeader
        icon={<DialogIcon tone="muted" />}
        title={<>Can’t delete {projectName} yet</>}
        description="This project still has tasks and subtasks. Move or delete them, then try again."
      />
      <PromptDialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Close
        </Button>
        <ActionButton type="button" size="lg" onClick={onOpenTasks}>
          Open tasks
        </ActionButton>
      </PromptDialogFooter>
    </>
  )
}
