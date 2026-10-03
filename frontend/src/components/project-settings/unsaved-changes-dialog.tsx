import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
      <DialogContent
        showCloseButton={false}
        className="gap-6 rounded-3xl p-7 sm:max-w-[480px]"
      >
        <DialogHeader className="gap-2">
          <DialogTitle className="text-[22px] leading-7.5 font-semibold tracking-tight">
            Save changes to {projectName}?
          </DialogTitle>
          <DialogDescription className="leading-5.5">
            You have unsaved changes. Save them or discard them before leaving;
            nothing is saved on its own.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2.5 pt-1">
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
          <Button
            type="button"
            size="lg"
            className="px-4.5 font-semibold"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
