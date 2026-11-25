import * as React from "react"
import type { Editor } from "@tiptap/react"
import { ImageUpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { InsertImageDialog } from "./insert-image-dialog"
import { openImageDialog, registerImageDialog } from "./open-image-dialog"

/**
 * The insert dialog of one editor, mounted once beside it. The toolbar
 * button and "/image" open it through `openImageDialog`.
 */
export function EditorImageDialog({
  editor,
  publicOnly = false,
}: {
  editor: Editor
  /** Disallow private uploads (e.g. GitHub-synced tasks and subtasks). */
  publicOnly?: boolean
}) {
  const [open, setOpen] = React.useState(false)

  React.useEffect(
    () => registerImageDialog(editor, () => setOpen(true)),
    [editor]
  )

  return (
    <InsertImageDialog
      editor={editor}
      open={open}
      onOpenChange={setOpen}
      publicOnly={publicOnly}
    />
  )
}

/** The toolbar's image control, in place of the package's link-only one. */
export function ImageToolbarButton({ editor }: { editor: Editor }) {
  return (
    // 32px, as the package's own toolbar buttons are.
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Insert image"
      title="Insert image"
      disabled={!editor.isEditable}
      onClick={() => openImageDialog(editor)}
    >
      <ImageUpIcon />
    </Button>
  )
}
