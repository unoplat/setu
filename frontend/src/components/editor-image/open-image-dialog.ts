import type { Editor } from "@tiptap/react"

// Lets the toolbar button and the "/" menu, which only hold the editor, open
// that editor's insert dialog (EditorImageDialog registers it while mounted).

const openers = new WeakMap<Editor, () => void>()

export function registerImageDialog(editor: Editor, open: () => void) {
  openers.set(editor, open)
  return () => {
    if (openers.get(editor) === open) openers.delete(editor)
  }
}

export function openImageDialog(editor: Editor) {
  openers.get(editor)?.()
}
