import type { Editor } from "@tiptap/react"

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
