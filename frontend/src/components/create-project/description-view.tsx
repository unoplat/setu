import { EditorContent, useEditor } from "@tiptap/react"
import * as React from "react"
import { RichTextProvider } from "reactjs-tiptap-editor"
import { themeActions } from "reactjs-tiptap-editor/theme"
import "reactjs-tiptap-editor/style.css"

import { useTheme } from "@/components/theme-provider"

import { descriptionEditorOptions } from "./description-extensions"
import { editorDescription } from "./description-html"

// A saved description, shown as the editor shows it but read-only
// (`editable: false`, https://tiptap.dev/docs/editor/api/editor#editable).
// Parsing through the same extensions, rather than setting innerHTML, means
// only what the editor's schema knows reaches the page. No controls are
// mounted, so nothing inside the provider can change the document.

const editorProps = {
  attributes: { "aria-label": "Description" },
}

export default function DescriptionView({ value }: { value: string }) {
  const { resolvedTheme } = useTheme()

  const editor = useEditor(
    {
      ...descriptionEditorOptions,
      content: editorDescription(value),
      editable: false,
      editorProps,
    },
    // A different saved description is a different document.
    [value]
  )

  React.useEffect(() => {
    themeActions.setTheme(resolvedTheme === "dark" ? "dark" : "light")
  }, [resolvedTheme])

  if (!editor) return null

  return (
    <div className="envision-rte -mx-2.5" data-layout="document">
      <RichTextProvider editor={editor}>
        <EditorContent editor={editor} className="envision-rte-content" />
      </RichTextProvider>
    </div>
  )
}
