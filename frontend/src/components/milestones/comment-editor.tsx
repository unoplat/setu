import { EditorContent, useEditor } from "@tiptap/react"
import { FrappeContext } from "frappe-react-sdk"
import * as React from "react"
import { RichTextProvider } from "reactjs-tiptap-editor"
import { RichTextBold } from "reactjs-tiptap-editor/bold"
import { RichTextBubbleLink } from "reactjs-tiptap-editor/bubble/link"
import { RichTextBubbleText } from "reactjs-tiptap-editor/bubble/text"
import { RichTextCode } from "reactjs-tiptap-editor/code"
import { RichTextItalic } from "reactjs-tiptap-editor/italic"
import { RichTextLink } from "reactjs-tiptap-editor/link"
import { SlashCommandList } from "reactjs-tiptap-editor/slashcommand"
import { RichTextStrike } from "reactjs-tiptap-editor/strike"
import { themeActions } from "reactjs-tiptap-editor/theme"
import "reactjs-tiptap-editor/style.css"

import { descriptionSlashCommands } from "@/components/create-project/slash-commands"
import { useTheme } from "@/components/theme-provider"

import { commentExtensions, searchMentions } from "./comment-extensions"

// The comment box of 06d's Activity section: "Type / for formatting, @ to
// mention". The parent remounts it (a new `key`) to start an empty comment
// after one is posted, which also resets the undo history.

const selectionControls = (
  <>
    <RichTextBold />
    <RichTextItalic />
    <RichTextStrike />
    <RichTextCode />
    <RichTextLink />
  </>
)

const editorProps = {
  attributes: { "aria-label": "Comment" },
}

/** Lets the comment box be focused from outside, as Reply does. */
export interface CommentEditorHandle {
  focus: () => void
}

export default function CommentEditor({
  ref,
  header,
  onChange,
  onFocusChange,
}: {
  ref?: React.Ref<CommentEditorHandle>
  /** Shown inside the box above the text, as a reply's quote is. */
  header?: React.ReactNode
  /** The comment's HTML, or "" while it is empty. */
  onChange: (html: string) => void
  onFocusChange: (focused: boolean) => void
}) {
  const { resolvedTheme } = useTheme()
  const frappe = React.useContext(FrappeContext)

  // Built once: the provider's `call` client outlives this editor.
  const [extensions] = React.useState(() =>
    commentExtensions((query) =>
      frappe
        ? searchMentions(frappe.call, query)
        : Promise.reject(new Error("No Frappe client to search with"))
    )
  )

  const editor = useEditor({
    extensions,
    textDirection: "auto",
    editorProps,
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
    onFocus: () => onFocusChange(true),
    onBlur: () => onFocusChange(false),
  })

  React.useEffect(() => {
    themeActions.setTheme(resolvedTheme === "dark" ? "dark" : "light")
  }, [resolvedTheme])

  // Leaving the page while the box has focus never fires `onBlur`.
  React.useEffect(() => () => onFocusChange(false), [onFocusChange])

  React.useImperativeHandle(
    ref,
    () => ({ focus: () => editor?.commands.focus("end") }),
    [editor]
  )

  if (!editor) return null

  return (
    <div
      className="envision-rte rounded-lg border border-input bg-card transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
      data-layout="comment"
    >
      {header}
      <RichTextProvider editor={editor}>
        <EditorContent editor={editor} className="envision-rte-content" />
        <RichTextBubbleText buttonBubble={selectionControls} />
        <RichTextBubbleLink />
        <SlashCommandList commandList={descriptionSlashCommands} />
      </RichTextProvider>
    </div>
  )
}
