import type { Editor } from "@tiptap/react"
import { PencilRulerIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { openExcalidrawDialog } from "./open-excalidraw-dialog"

/** The toolbar's Excalidraw control, next to the image upload button. */
export function ExcalidrawToolbarButton({ editor }: { editor: Editor }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Insert Excalidraw drawing"
      title="Insert Excalidraw drawing"
      disabled={!editor.isEditable}
      onClick={() => openExcalidrawDialog(editor)}
    >
      <PencilRulerIcon />
    </Button>
  )
}
