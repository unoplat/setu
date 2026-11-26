import type { Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { PencilIcon } from "lucide-react"
import * as React from "react"

import { isExcalidrawImageSrc } from "./excalidraw-file"
import {
  type ExcalidrawEditTarget,
  openExcalidrawDialog,
} from "./open-excalidraw-dialog"

function getSelectedExcalidrawImage(
  editor: Editor
): ExcalidrawEditTarget | null {
  const { selection, doc } = editor.state
  const { from, to } = selection
  if (from === to) return null

  let found: ExcalidrawEditTarget | null = null
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "image" && node.type.name !== "imageBlock") return
    if (
      pos >= from &&
      pos + node.nodeSize <= to &&
      typeof node.attrs.src === "string" &&
      isExcalidrawImageSrc(node.attrs.src)
    ) {
      if (found) {
        found = null
        return false
      }
      found = { pos, src: node.attrs.src }
    }
  })

  if (!found) return null
  const { pos, src } = found
  const node = doc.nodeAt(pos)
  if (!node || from !== pos || to !== pos + node.nodeSize) {
    return null
  }
  return { pos, src }
}

const BUBBLE_OPTIONS = {
  placement: "top" as const,
  offset: 8,
  flip: true,
}

/**
 * Floating "Edit drawing" action shown above a selected Excalidraw image so it
 * never collides with `RichTextBubbleImage` (which sits below the image).
 */
export function ExcalidrawImageBubble({ editor }: { editor: Editor }) {
  const shouldShow = React.useCallback(
    ({ editor: currentEditor }: { editor: Editor }) =>
      currentEditor.isEditable &&
      getSelectedExcalidrawImage(currentEditor) !== null,
    []
  )

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="ExcalidrawImageBubble"
      options={BUBBLE_OPTIONS}
      shouldShow={shouldShow}
    >
      <div className="envision-rte-bubble">
        <button
          type="button"
          className="envision-rte-bubble-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const target = getSelectedExcalidrawImage(editor)
            if (target) openExcalidrawDialog(editor, target)
          }}
        >
          <PencilIcon className="size-3.5" aria-hidden />
          Edit drawing
        </button>
      </div>
    </BubbleMenu>
  )
}
