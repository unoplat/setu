import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  Separator,
  StrikeThroughSupSubToggles,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor"
import "@mdxeditor/editor/style.css"
import * as React from "react"

import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

// Paper: "Expanded Description — mxeditor" toolbar: block type | B I S |
// bullet & check lists | link | "Rich text". Loaded lazily by the dialog
// because MDXEditor (Lexical) is the largest dependency in the app.

export default function DescriptionEditor({
  value,
  onChange,
  onError,
  className,
}: {
  value: string
  onChange: (markdown: string) => void
  /** The draft could not be parsed; the editor stays empty when this fires. */
  onError: () => void
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  const editor = React.useRef<MDXEditorMethods>(null)

  // The `autoFocus` prop loses to the dialog's focus management when this
  // chunk loads lazily, so focus through the ref once the editor is mounted.
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      editor.current?.focus(undefined, { defaultSelection: "rootEnd" })
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <MDXEditor
      ref={editor}
      markdown={value}
      // Drafts typed in the compact textarea are not always valid MDX (an
      // unclosed "<Tag>", a bare "<br>"); the parent then falls back to a
      // plain editor instead of showing an empty one.
      onError={onError}
      onChange={(markdown, initialNormalize) => {
        // The first call only normalises the initial markdown; keep the draft
        // untouched so an untouched editor never dirties the form.
        if (!initialNormalize) onChange(markdown)
      }}
      placeholder="Describe the goal, scope, and what done looks like."
      className={cn(
        "envision-mdx",
        resolvedTheme === "dark" && "dark-theme dark-editor",
        className
      )}
      contentEditableClassName="envision-mdx-content"
      plugins={[
        headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarClassName: "envision-mdx-toolbar",
          toolbarContents: () => (
            <>
              <BlockTypeSelect />
              <Separator />
              <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
              <StrikeThroughSupSubToggles options={["Strikethrough"]} />
              <Separator />
              <ListsToggle options={["bullet", "check"]} />
              <Separator />
              <CreateLink />
              <span className="ms-auto pe-1 text-xs text-muted-foreground">
                Rich text
              </span>
            </>
          ),
        }),
      ]}
    />
  )
}
