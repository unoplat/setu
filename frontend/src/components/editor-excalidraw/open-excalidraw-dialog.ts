import type { Editor } from "@tiptap/react"

// Lets the toolbar button, "/" menu, and selected-image bubble open one
// editor's Excalidraw modal in either insert mode or edit mode.

export interface ExcalidrawEditTarget {
  pos: number
  src: string
}

type Opener = (target?: ExcalidrawEditTarget) => void

const openers = new WeakMap<Editor, Opener>()

export function registerExcalidrawDialog(editor: Editor, open: Opener) {
  openers.set(editor, open)
  return () => {
    if (openers.get(editor) === open) openers.delete(editor)
  }
}

export function openExcalidrawDialog(
  editor: Editor,
  target?: ExcalidrawEditTarget
) {
  openers.get(editor)?.(target)
}
