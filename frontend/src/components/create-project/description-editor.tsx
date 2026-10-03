import { EditorContent, useEditor } from "@tiptap/react"
import * as React from "react"
import { RichTextProvider } from "reactjs-tiptap-editor"
import { RichTextBlockquote } from "reactjs-tiptap-editor/blockquote"
import { RichTextBold } from "reactjs-tiptap-editor/bold"
import { RichTextBubbleCodeBlock } from "reactjs-tiptap-editor/bubble/codeblock"
import { RichTextBubbleColumns } from "reactjs-tiptap-editor/bubble/columns"
import { RichTextBubbleLink } from "reactjs-tiptap-editor/bubble/link"
import { RichTextBubbleImage } from "reactjs-tiptap-editor/bubble/media"
import { RichTextBubbleTable } from "reactjs-tiptap-editor/bubble/table"
import { RichTextBubbleText } from "reactjs-tiptap-editor/bubble/text"
import { RichTextBulletList } from "reactjs-tiptap-editor/bulletlist"
import { RichTextClear } from "reactjs-tiptap-editor/clear"
import { RichTextCode } from "reactjs-tiptap-editor/code"
import { RichTextCodeBlock } from "reactjs-tiptap-editor/codeblock"
import { RichTextColor } from "reactjs-tiptap-editor/color"
import { RichTextColumn } from "reactjs-tiptap-editor/column"
import { RichTextDetails } from "reactjs-tiptap-editor/details"
import { RichTextEmoji } from "reactjs-tiptap-editor/emoji"
import { RichTextFontFamily } from "reactjs-tiptap-editor/fontfamily"
import { RichTextFontSize } from "reactjs-tiptap-editor/fontsize"
import { RichTextFormatPainter } from "reactjs-tiptap-editor/formatpainter"
import { RichTextHeading } from "reactjs-tiptap-editor/heading"
import { RichTextHighlight } from "reactjs-tiptap-editor/highlight"
import { RichTextRedo, RichTextUndo } from "reactjs-tiptap-editor/history"
import { RichTextHorizontalRule } from "reactjs-tiptap-editor/horizontalrule"
import { RichTextImage } from "reactjs-tiptap-editor/image"
import { RichTextIndent } from "reactjs-tiptap-editor/indent"
import { RichTextItalic } from "reactjs-tiptap-editor/italic"
import { RichTextLineHeight } from "reactjs-tiptap-editor/lineheight"
import { RichTextLink } from "reactjs-tiptap-editor/link"
import { RichTextMoreMark } from "reactjs-tiptap-editor/moremark"
import { RichTextOrderedList } from "reactjs-tiptap-editor/orderedlist"
import { RichTextSearchAndReplace } from "reactjs-tiptap-editor/searchandreplace"
import { SlashCommandList } from "reactjs-tiptap-editor/slashcommand"
import { RichTextStrike } from "reactjs-tiptap-editor/strike"
import { RichTextTable } from "reactjs-tiptap-editor/table"
import { RichTextTaskList } from "reactjs-tiptap-editor/tasklist"
import { RichTextAlign } from "reactjs-tiptap-editor/textalign"
import { RichTextTextDirection } from "reactjs-tiptap-editor/textdirection"
import { RichTextUnderline } from "reactjs-tiptap-editor/textunderline"
import { themeActions } from "reactjs-tiptap-editor/theme"
import "reactjs-tiptap-editor/style.css"

import { useTheme } from "@/components/theme-provider"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

import {
  descriptionEditorOptions,
  descriptionFieldEditorOptions,
} from "./description-extensions"
import {
  editorDescription,
  replaceDocument,
  storedDescription,
} from "./description-html"
import { descriptionSlashCommands } from "./slash-commands"

// The description field of the Create Project form, in both of its layouts:
// a bordered box in the compact dialog and the full writing surface of Paper's
// "Expanded Description". `expanded` only changes what surrounds the document,
// so one editor instance carries the draft across. The toolbar carries every
// playground control whose result survives being saved as HTML in ERPNext
// (see description-extensions.ts).

// Shown over a text selection. The package's default set assumes AI is
// registered, so name the controls this editor has.
const selectionControls = (
  <>
    <RichTextBold />
    <RichTextItalic />
    <RichTextUnderline />
    <RichTextStrike />
    <RichTextCode />
    <RichTextColor />
    <RichTextHighlight />
    <RichTextLink />
  </>
)

export default function DescriptionEditor({
  value,
  revision = 0,
  onChange,
  onBlur,
  expanded,
  plain = false,
  label = "Project description",
}: {
  /** The saved HTML; the editor reads it at first and on each `revision`. */
  value: string
  /**
   * Moves when `value` was replaced from outside (a change made elsewhere),
   * which the editor then shows. Otherwise `value` is only the editor's own
   * edits coming back, flowing out through `onChange`.
   */
  revision?: number
  onChange: (html: string) => void
  onBlur?: () => void
  /** Layout only: the compact box, or the full surface with its toolbar. */
  expanded: boolean
  /**
   * The description as a field of a record page (Paper 09, 09b, 09c): an
   * outlined box as tall as its text, with the "/" hint while it is empty or
   * being written.
   */
  plain?: boolean
  /** The document's accessible name. */
  label?: string
}) {
  const { resolvedTheme } = useTheme()

  // `value` follows every keystroke, but it only seeds the document: handing
  // the live value back to useEditor would re-apply the options on each render.
  const [initialContent] = React.useState(() => editorDescription(value))
  // Fixed for the editor's life, like the content: new options on a later
  // render would be re-applied to the editor.
  const [editorProps] = React.useState(() => ({
    attributes: { "aria-label": label },
  }))

  const editor = useEditor({
    ...(plain ? descriptionFieldEditorOptions : descriptionEditorOptions),
    content: initialContent,
    editorProps,
    // Only real edits emit an update, so an untouched editor never dirties
    // the form with re-serialised HTML. useEditor always calls the latest
    // callback, so `onChange` needs no ref.
    onUpdate: ({ editor }) => onChange(storedDescription(editor)),
    onBlur: () => onBlur?.(),
  })

  // A replaced value is loaded into the document, even mid-edit: the form
  // only replaces it where the user had nothing unsaved.
  const shownRevision = React.useRef(revision)
  React.useEffect(() => {
    if (!editor || editor.isDestroyed || shownRevision.current === revision) {
      return
    }
    shownRevision.current = revision
    replaceDocument(editor, editorDescription(value))
  }, [editor, revision, value])

  // The package keeps its theme in a shared store rather than reading the
  // app's `.dark` class.
  React.useEffect(() => {
    themeActions.setTheme(resolvedTheme === "dark" ? "dark" : "light")
  }, [resolvedTheme])

  // Changing layout unmounts the control that asked for it, so bring focus
  // back to the document, where the selection is still in place. The compact
  // layout leaves the first focus to the project name.
  const focusedLayout = React.useRef(false)
  React.useEffect(() => {
    if (!editor || focusedLayout.current === expanded) return
    const frame = requestAnimationFrame(() => {
      focusedLayout.current = expanded
      editor.commands.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, expanded])

  if (!editor) return null

  return (
    <div
      className={cn(
        "envision-rte",
        expanded
          ? "flex min-h-0 flex-1 flex-col"
          : plain
            ? "group/field rounded-lg border border-input bg-card transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
            : "rounded-xl border border-transparent bg-input/50 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
      )}
      data-layout={expanded ? "expanded" : plain ? "field" : "compact"}
    >
      <RichTextProvider editor={editor}>
        {expanded ? (
          <div
            role="toolbar"
            aria-label="Text formatting"
            className="envision-rte-toolbar"
          >
            <RichTextUndo />
            <RichTextRedo />
            <span className="envision-rte-separator" />
            <RichTextSearchAndReplace />
            <RichTextClear />
            <RichTextFormatPainter />
            <span className="envision-rte-separator" />
            <RichTextHeading />
            <RichTextFontFamily />
            <RichTextFontSize />
            <span className="envision-rte-separator" />
            <RichTextBold />
            <RichTextItalic />
            <RichTextUnderline />
            <RichTextStrike />
            <RichTextMoreMark />
            <RichTextCode />
            <RichTextColor />
            <RichTextHighlight />
            <RichTextEmoji />
            <span className="envision-rte-separator" />
            <RichTextAlign />
            <RichTextIndent />
            <RichTextLineHeight />
            <RichTextTextDirection />
            <span className="envision-rte-separator" />
            <RichTextBulletList />
            <RichTextOrderedList />
            <RichTextTaskList />
            <span className="envision-rte-separator" />
            <RichTextLink />
            <RichTextImage />
            <RichTextBlockquote />
            <RichTextHorizontalRule />
            <RichTextCodeBlock />
            <RichTextTable />
            <RichTextColumn />
            <RichTextDetails />
            <span className="envision-rte-label">Rich text</span>
          </div>
        ) : null}
        <EditorContent editor={editor} className="envision-rte-content" />
        <RichTextBubbleText buttonBubble={selectionControls} />
        <RichTextBubbleLink />
        <RichTextBubbleImage />
        <RichTextBubbleTable />
        <RichTextBubbleColumns />
        <RichTextBubbleCodeBlock />
        <SlashCommandList commandList={descriptionSlashCommands} />
      </RichTextProvider>
      {/* Outside the provider: the package redefines the colour variables
          for everything inside it. Clicking the hint writes at the end. */}
      {plain && !expanded ? (
        <div
          aria-hidden
          className="hidden cursor-text items-center justify-end gap-1 px-3.5 pb-2.5 text-xs text-muted-foreground group-focus-within/field:flex group-has-[.is-editor-empty]/field:flex"
          onMouseDown={(event) => {
            event.preventDefault()
            editor.commands.focus("end")
          }}
        >
          <Kbd>/</Kbd>
          for headings, lists, tables
        </div>
      ) : null}
    </div>
  )
}
