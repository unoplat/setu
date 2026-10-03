import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Journey guardrail "Unsaved draft": closing a Create panel (milestone,
// module) with a draft asks to keep editing or discard; nothing saves
// silently. Escape and "Keep editing" both return to the draft.
export function DiscardDraftDialog({
  open,
  onKeepEditing,
  onDiscard,
  record = "milestone",
  draft = "title and description",
}: {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
  /** What the panel creates ("module"). */
  record?: string
  /** What the draft holds ("name and description"). */
  draft?: string
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeepEditing()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this {record}?</AlertDialogTitle>
          <AlertDialogDescription>
            The {draft} you wrote will be lost. The {record} hasn’t been created
            yet.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
