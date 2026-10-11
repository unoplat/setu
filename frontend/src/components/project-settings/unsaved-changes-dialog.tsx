import { ActionButton } from "@/components/app-ui/action-button"
import {
  PromptDialogContent,
  PromptDialogFooter,
  PromptDialogHeader,
} from "@/components/app-ui/prompt-dialog"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"

// Journey guardrail "Unsaved changes": leaving Settings with edits asks to
// save or discard; nothing saves silently. Escape and outside clicks mean
// "keep editing".
export function UnsavedChangesDialog({
  open,
  projectName,
  saving,
  onKeepEditing,
  onDiscard,
  onSave,
}: {
  open: boolean
  projectName: string
  saving: boolean
  onKeepEditing: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) return
        if (saving) {
          details.cancel()
          return
        }
        onKeepEditing()
      }}
    >
      <PromptDialogContent>
        <PromptDialogHeader
          title={<>Save changes to {projectName}?</>}
          description="You have unsaved changes. Save them or discard them before leaving; nothing is saved on its own."
        />
        <PromptDialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="sm:me-auto"
            disabled={saving}
            onClick={onKeepEditing}
          >
            Keep editing
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            disabled={saving}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <ActionButton
            type="button"
            size="lg"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save changes"}
          </ActionButton>
        </PromptDialogFooter>
      </PromptDialogContent>
    </Dialog>
  )
}
