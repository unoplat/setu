import { createDocument, type Editor } from "@tiptap/react"

// Frappe cleans the description's HTML when the Project is saved and drops
// attributes it does not know, while keeping any `data-*` attribute. The
// package writes a few of its own (an image's `inline`, a table cell's `colwidth`),
// so they are stored under a `data-rte-` name and renamed back when a
// description is opened.

const PACKAGE_ATTRIBUTES = ["inline", "flipx", "flipy", "caption", "colwidth"]
const STORED_PREFIX = "data-rte-"

function renameAttributes(
  html: string,
  rename: (name: string) => [string, string]
) {
  const body = new DOMParser().parseFromString(html, "text/html").body
  for (const name of PACKAGE_ATTRIBUTES) {
    const [from, to] = rename(name)
    for (const element of body.querySelectorAll(`[${from}]`)) {
      element.setAttribute(to, element.getAttribute(from) ?? "")
      element.removeAttribute(from)
    }
  }
  return body.innerHTML
}

/** The HTML to save; an empty document is "" rather than an empty paragraph. */
export function storedDescription(editor: Editor): string {
  if (editor.isEmpty) return ""
  return renameAttributes(editor.getHTML(), (name) => [
    name,
    STORED_PREFIX + name,
  ])
}

/** Saved HTML as the editor's extensions expect to parse it. */
export function editorDescription(stored: string): string {
  if (!stored) return ""
  return renameAttributes(stored, (name) => [STORED_PREFIX + name, name])
}

/**
 * Bring the document to `html` by replacing only the stretch that differs, so
 * the cursor and the user's undo history outside it stay where they were.
 * The change is not the user's: it is not undoable and emits no update, so
 * the form is not handed it back as an edit.
 */
export function replaceDocument(editor: Editor, html: string) {
  const { doc, tr } = editor.state
  const next = createDocument(html, editor.schema, editor.options.parseOptions)
  const start = doc.content.findDiffStart(next.content)
  if (start === null) return
  let { a: end, b: nextEnd } = doc.content.findDiffEnd(next.content)!
  // Repeated content can make the two ends cross the start.
  const overlap = start - Math.min(end, nextEnd)
  if (overlap > 0) {
    end += overlap
    nextEnd += overlap
  }
  editor.view.dispatch(
    tr
      .replace(start, end, next.slice(start, nextEnd))
      .setMeta("addToHistory", false)
      .setMeta("preventUpdate", true)
  )
}
