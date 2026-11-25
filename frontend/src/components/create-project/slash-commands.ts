import type * as React from "react"
import type { SlashCommandList } from "reactjs-tiptap-editor/slashcommand"

import { openImageDialog } from "@/components/editor-image/open-image-dialog"

import { DEFAULT_MERMAID_CODE, MERMAID_LANGUAGE } from "./mermaid-code-block"

type CommandList = NonNullable<
  React.ComponentProps<typeof SlashCommandList>["commandList"]
>
type Command = CommandList[number]["commands"][number]

// The package's default "/" menu also offers video and a table of contents,
// which the description editor leaves out (see description-extensions.ts).
// This list names only the blocks the editor registers. Module-level so
// SlashCommandList sees one stable array instead of re-registering it on
// every render.

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const

export const descriptionSlashCommands: CommandList = [
  {
    name: "format",
    title: "Format",
    commands: [
      {
        name: "paragraph",
        label: "Paragraph",
        aliases: ["p", "text"],
        iconName: "HeadingParagraph",
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setParagraph().run()
        },
      },
      ...HEADING_LEVELS.map((level): Command => ({
        name: `heading${level}`,
        label: `Heading ${level}`,
        aliases: [`h${level}`],
        iconName: `Heading${level}`,
        isActive: (editor) => editor.isActive("heading", { level }),
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHeading({ level }).run()
        },
      })),
      {
        name: "bulletList",
        label: "Bullet list",
        aliases: ["ul", "list"],
        iconName: "List",
        isActive: (editor) => editor.isActive("bulletList"),
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run()
        },
      },
      {
        name: "orderedList",
        label: "Numbered list",
        aliases: ["ol", "ordered"],
        iconName: "ListOrdered",
        isActive: (editor) => editor.isActive("orderedList"),
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run()
        },
      },
      {
        name: "taskList",
        label: "Check list",
        aliases: ["todo", "task", "checkbox"],
        iconName: "ListTodo",
        isActive: (editor) => editor.isActive("taskList"),
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleTaskList().run()
        },
      },
      {
        name: "codeBlock",
        label: "Code block",
        aliases: ["code", "pre", "snippet"],
        iconName: "Code2",
        isActive: (editor) => editor.isActive("codeBlock"),
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setCodeBlock().run()
        },
      },
      {
        name: "blockquote",
        label: "Quote",
        aliases: ["blockquote"],
        iconName: "TextQuote",
        isActive: (editor) => editor.isActive("blockquote"),
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setBlockquote().run()
        },
      },
    ],
  },
  {
    name: "insert",
    title: "Insert",
    commands: [
      // Envision's own dialog (components/editor-image), which can upload.
      {
        name: "image",
        label: "Image",
        aliases: ["img", "picture", "photo", "upload"],
        iconName: "ImageUp",
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).run()
          openImageDialog(editor)
        },
      },
      {
        name: "table",
        label: "Table",
        aliases: ["grid"],
        iconName: "Table",
        action: ({ editor, range }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        },
      },
      {
        name: "columns",
        label: "Columns",
        aliases: ["cols", "layout"],
        iconName: "Columns2",
        action: ({ editor, range }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertColumns({ cols: 2 })
            .run()
        },
      },
      // A code block GitHub also draws (see mermaid-code-block.ts).
      {
        name: "mermaid",
        label: "Mermaid diagram",
        aliases: ["diagram", "flowchart", "chart", "graph"],
        iconName: "Mermaid",
        action: ({ editor, range }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "codeBlock",
              attrs: { language: MERMAID_LANGUAGE },
              content: [{ type: "text", text: DEFAULT_MERMAID_CODE }],
            })
            .run()
        },
      },
      {
        name: "details",
        label: "Collapsible section",
        aliases: ["toggle", "collapse", "details", "accordion"],
        iconName: "Details",
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setDetails().run()
        },
      },
      {
        name: "horizontalRule",
        label: "Divider",
        aliases: ["hr", "rule", "line"],
        iconName: "Minus",
        action: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHorizontalRule().run()
        },
      },
    ],
  },
]
