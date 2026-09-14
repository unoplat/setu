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
  quotePlugin,
  Separator,
  StrikeThroughSupSubToggles,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor"
import "@mdxeditor/editor/style.css"

import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

// Paper: "Expanded Description — mxeditor" toolbar: block type | B I S |
// bullet & check lists | link | "Rich text". Loaded lazily by the dialog
// because MDXEditor (Lexical) is the largest dependency in the app.

export default function DescriptionEditor({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (markdown: string) => void
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  return (
    <MDXEditor
      markdown={value}
      onChange={(markdown, initialNormalize) => {
        // The first call only normalises the initial markdown; keep the draft
        // untouched so an untouched editor never dirties the form.
        if (!initialNormalize) onChange(markdown)
      }}
      autoFocus={{ defaultSelection: "rootEnd", preventScroll: true }}
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
