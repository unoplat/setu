import * as React from "react"

import { cn } from "@/lib/utils"

import type { MentionSuggestion } from "./comment-extensions"

// The "@" list of the comment box. reactjs-tiptap-editor's own list says
// "Empty" for everything: before a name is typed (Frappe returns nobody for a
// blank search), while a search runs, after one fails, and when nobody
// matches. This one tells those apart.

/** Lets the editor hand the list the keys pressed while it is open. */
export interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export interface MentionListProps {
  items: MentionSuggestion[]
  query: string
  loading: boolean
  /** The search for `query` failed, rather than finding nobody. */
  failed: boolean
  command: (item: MentionSuggestion) => void
}

export function MentionList({
  ref,
  items,
  query,
  loading,
  failed,
  command,
}: MentionListProps & { ref?: React.Ref<MentionListHandle> }) {
  const [active, setActive] = React.useState(0)
  const [shownItems, setShownItems] = React.useState(items)
  if (items !== shownItems) {
    setShownItems(items)
    setActive(0)
  }

  React.useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false
        if (event.key === "ArrowDown") {
          setActive((active + 1) % items.length)
          return true
        }
        if (event.key === "ArrowUp") {
          setActive((active + items.length - 1) % items.length)
          return true
        }
        // Only a plain Enter picks; ⌘↵ still posts and ⇧↵ still breaks.
        if (
          event.key === "Enter" &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          command(items[active])
          return true
        }
        return false
      },
    }),
    [items, active, command]
  )

  const status =
    query === ""
      ? { text: "Type a name to mention" }
      : loading
        ? { text: "Searching…" }
        : failed
          ? { text: "Couldn't search people. Type to retry.", error: true }
          : items.length === 0
            ? { text: "No matching people" }
            : null

  // Colors come from the package's richtext-* classes: under
  // [data-richtext-portal] the app's color tokens hold the package's HSL
  // values (see index.css), which the app's own color utilities can't read.
  // The attribute itself also lifts the list above dialogs and keeps Escape
  // from collapsing an expanded editor (record-detail.tsx).
  return (
    <div
      data-richtext-portal
      className="!richtext-max-h-[320px] !richtext-w-[160px] richtext-overflow-y-auto richtext-overflow-x-hidden richtext-rounded-md !richtext-border !richtext-border-solid !richtext-border-border richtext-bg-popover richtext-p-1 richtext-text-popover-foreground richtext-shadow-md richtext-outline-none"
    >
      {status ? (
        <p
          role="status"
          className={cn(
            "richtext-px-2 richtext-py-1.5 richtext-text-xs",
            status.error
              ? "richtext-text-destructive"
              : "richtext-text-muted-foreground"
          )}
        >
          {status.text}
        </p>
      ) : (
        <div role="listbox" aria-label="People">
          {items.map((item, index) => (
            <div
              key={item.id}
              role="option"
              aria-selected={index === active}
              className={cn(
                "richtext-flex richtext-w-full richtext-items-center richtext-gap-3 richtext-rounded-sm !richtext-border-none !richtext-bg-transparent richtext-px-2 richtext-py-1.5 richtext-text-left richtext-text-sm richtext-text-foreground !richtext-outline-none richtext-transition-colors hover:!richtext-bg-accent",
                { "bg-item-active": index === active }
              )}
              // Keep the editor focused, so the comment box doesn't blur
              // (and drop its ⌘↵ binding) between press and release.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command(item)}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
