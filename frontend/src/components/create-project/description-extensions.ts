import { Document } from "@tiptap/extension-document"
import { HardBreak } from "@tiptap/extension-hard-break"
import { ListItem } from "@tiptap/extension-list"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"
import { TextStyle } from "@tiptap/extension-text-style"
import {
  Dropcursor,
  Gapcursor,
  Placeholder,
  TrailingNode,
} from "@tiptap/extensions"
import { Blockquote } from "reactjs-tiptap-editor/blockquote"
import { Bold } from "reactjs-tiptap-editor/bold"
import { BulletList } from "reactjs-tiptap-editor/bulletlist"
import { Clear } from "reactjs-tiptap-editor/clear"
import { Code } from "reactjs-tiptap-editor/code"
import { CodeBlock } from "reactjs-tiptap-editor/codeblock"
import { Color } from "reactjs-tiptap-editor/color"
import {
  Column,
  ColumnNode,
  MultipleColumnNode,
} from "reactjs-tiptap-editor/column"
import { Details } from "reactjs-tiptap-editor/details"
import { Emoji } from "reactjs-tiptap-editor/emoji"
import { FontFamily } from "reactjs-tiptap-editor/fontfamily"
import { FontSize } from "reactjs-tiptap-editor/fontsize"
import { FormatPainter } from "reactjs-tiptap-editor/formatpainter"
import { Heading } from "reactjs-tiptap-editor/heading"
import { Highlight } from "reactjs-tiptap-editor/highlight"
import { History } from "reactjs-tiptap-editor/history"
import { HorizontalRule } from "reactjs-tiptap-editor/horizontalrule"
import { Image } from "reactjs-tiptap-editor/image"
import { Indent } from "reactjs-tiptap-editor/indent"
import { Italic } from "reactjs-tiptap-editor/italic"
import { LineHeight } from "reactjs-tiptap-editor/lineheight"
import { Link } from "reactjs-tiptap-editor/link"
import { MarkdownPaste } from "reactjs-tiptap-editor/markdownpaste"
import { MoreMark } from "reactjs-tiptap-editor/moremark"
import { OrderedList } from "reactjs-tiptap-editor/orderedlist"
import { SearchAndReplace } from "reactjs-tiptap-editor/searchandreplace"
import { SlashCommand } from "reactjs-tiptap-editor/slashcommand"
import { Strike } from "reactjs-tiptap-editor/strike"
import { Table } from "reactjs-tiptap-editor/table"
import { TaskList } from "reactjs-tiptap-editor/tasklist"
import { TextAlign } from "reactjs-tiptap-editor/textalign"
import { TextDirection } from "reactjs-tiptap-editor/textdirection"
import { TextUnderline } from "reactjs-tiptap-editor/textunderline"

// The description is saved as the editor's own HTML, which
// setu.api.project.create_project writes into ERPNext's `notes`. Frappe cleans
// that HTML on save, so every extension here writes tags, attributes and
// styles that the cleaning keeps (description-html.ts renames the few
// attributes it would not); description-extensions.test.ts covers the round
// trip. Left out of the playground's set: embeds whose tags Frappe strips
// (iframe, tweet, video), blocks that keep their text in an attribute, which
// Desk cannot show (callout, formula), and anything that needs an upload
// endpoint or an API key in the browser.

const DESCRIPTION_PLACEHOLDER =
  "Describe the goal, scope, and what done looks like. Press '/' for commands."

export const descriptionExtensions = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  ListItem,
  // The mark that colour, font family and font size write their styles on.
  TextStyle,
  Dropcursor,
  Gapcursor,
  // Keeps a paragraph after a trailing table or code block to click into.
  TrailingNode,
  Placeholder.configure({ placeholder: DESCRIPTION_PLACEHOLDER }),
  History,
  SearchAndReplace,
  Clear,
  FormatPainter,
  Heading.configure({ levels: [1, 2, 3] }),
  FontFamily,
  FontSize,
  Bold,
  Italic,
  TextUnderline,
  Strike,
  MoreMark,
  Code,
  Color,
  Highlight,
  TextAlign,
  Indent,
  LineHeight,
  TextDirection,
  BulletList,
  OrderedList,
  TaskList,
  Blockquote,
  HorizontalRule,
  CodeBlock,
  Details,
  Column,
  // The package reads both column nodes back wrongly: it looks for a wrapper
  // class it never writes, and takes the counts as strings. Frappe also drops
  // `index`, so both numbers come from the markup itself.
  ColumnNode.extend({
    addAttributes() {
      return {
        index: {
          default: 0,
          parseHTML: (element) =>
            Array.from(element.parentElement?.children ?? []).indexOf(element),
        },
      }
    },
  }),
  MultipleColumnNode.extend({
    addAttributes() {
      return {
        cols: {
          default: 2,
          parseHTML: (element) => element.children.length,
        },
      }
    },
    parseHTML() {
      return [{ tag: "div.columns" }]
    },
  }),
  // Frappe rewrites every link's rel to this value, so write it that way.
  Link.configure({ HTMLAttributes: { rel: "noopener noreferrer" } }),
  // By address only: the project does not exist yet, so there is nothing to
  // attach an upload to.
  Image.configure({ resourceImage: "link" }),
  Table,
  Emoji,
  SlashCommand,
  MarkdownPaste,
]

// Shared by the component and its tests. `textDirection` is what registers the
// `dir` attribute that the direction control writes.
export const descriptionEditorOptions = {
  extensions: descriptionExtensions,
  textDirection: "auto",
} as const

// A record page's description field shows the "/" hint under the text
// itself, so its placeholder only says what to write. The same editor also
// fills the expanded layout, which has no hint, so there the placeholder
// names "/" again. It is read on every transaction, and changing layout
// focuses the editor, which is one.
export const descriptionFieldEditorOptions = {
  ...descriptionEditorOptions,
  extensions: [
    ...descriptionExtensions.filter(
      (extension) => extension.name !== "placeholder"
    ),
    Placeholder.configure({
      placeholder: ({ editor }) =>
        editor.view.dom.closest('[data-layout="expanded"]')
          ? DESCRIPTION_PLACEHOLDER
          : "Add a description: the goal, the scope, and what done looks like.",
    }),
  ],
}
