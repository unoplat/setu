import { HardBreak } from "@tiptap/extension-hard-break"
import { Placeholder } from "@tiptap/extensions"
import { ReactRenderer } from "@tiptap/react"
import { Mention } from "reactjs-tiptap-editor/mention"

import { descriptionExtensions } from "@/components/create-project/description-extensions"
import type { FrappeConfig } from "frappe-react-sdk"

import {
  MentionList,
  type MentionListHandle,
  type MentionListProps,
} from "./mention-list"

// The comment box on 06d: the description editor's extensions, plus @mentions
// in the shape Frappe reads. Tiptap's Mention writes
// `<span class="mention" data-id="…">`, and Frappe's Comment.after_insert
// runs `notify_mentions`, which picks the user ids out of exactly that
// (frappe.desk.notifications.extract_mentions), so a mention here notifies
// the person as one typed in Desk would.

const MAX_SUGGESTIONS = 8

/** One row of Desk's mention search, frappe.desk.search.get_names_for_mentions. */
interface MentionCandidate {
  id: string
  value: string
  is_group?: boolean
}

export interface MentionSuggestion {
  id: string
  label: string
}

/**
 * Who "@" offers: the same search Desk's comment box uses, so it only lists
 * people with "Allowed In Mentions" on, who are also the only ones Frappe
 * notifies. User Groups are left out: Frappe expands a group only from
 * `data-is-group="true"`, which Tiptap's mention node does not write.
 * Rejects when the request fails, so a failed search isn't shown as nobody.
 */
export async function searchMentions(
  call: FrappeConfig["call"],
  query: string
): Promise<MentionSuggestion[]> {
  const response = await call.get<{ message: MentionCandidate[] }>(
    "frappe.desk.search.get_names_for_mentions",
    { search_term: query }
  )
  return response.message
    .filter((candidate) => !candidate.is_group)
    .slice(0, MAX_SUGGESTIONS)
    .map((candidate) => ({
      id: candidate.id,
      label: candidate.value || candidate.id,
    }))
}

// The suggestion plugin's render types, through the package's Mention, as
// @tiptap/suggestion is not a dependency of this app.
type MentionRenderHooks = ReturnType<
  NonNullable<(typeof Mention)["options"]["suggestion"]["render"]>
>
type MentionRenderProps = Parameters<
  NonNullable<MentionRenderHooks["onStart"]>
>[0]

/**
 * The suggestion `render` for "@", showing MentionList in place of the
 * package's list. `lookupFailed` says whether the search for a query failed:
 * the plugin hands a failed search to the list as an empty one.
 */
function renderMentionList(lookupFailed: (query: string) => boolean) {
  return () => {
    let list: ReactRenderer<MentionListHandle, MentionListProps> | undefined
    let unmount: (() => void) | undefined

    const listProps = (props: MentionRenderProps): MentionListProps => ({
      items: props.items,
      query: props.query,
      loading: props.loading,
      failed: !props.loading && lookupFailed(props.query),
      command: props.command,
    })

    return {
      onStart: (props: MentionRenderProps) => {
        list = new ReactRenderer(MentionList, {
          props: listProps(props),
          editor: props.editor,
        })
        // The plugin appends the list to <body>, keeps it under the caret and
        // closes it on a click elsewhere. Escape it handles itself.
        unmount = props.mount(list.element)
      },
      onUpdate: (props: MentionRenderProps) => {
        list?.updateProps(listProps(props))
      },
      onKeyDown: (props: { event: KeyboardEvent }) =>
        list?.ref?.onKeyDown(props) ?? false,
      onExit: () => {
        unmount?.()
        list?.destroy()
        unmount = undefined
        list = undefined
      },
    }
  }
}

/** Built once per editor, around a search that `@` calls as the user types. */
export function commentExtensions(
  search: (query: string) => Promise<MentionSuggestion[]>
) {
  // The query whose search last failed, for the list to report it. A search
  // that a newer keystroke superseded (`signal.aborted`) changes nothing.
  let failedQuery: string | null = null

  return [
    // Replaced below: the prompt differs, and ⌘↵ posts instead of breaking.
    ...descriptionExtensions.filter(
      (extension) =>
        extension.name !== "placeholder" && extension.name !== "hardBreak"
    ),
    Placeholder.configure({
      placeholder: "Add a comment… Type / for formatting, @ to mention",
    }),
    // HardBreak binds Mod-Enter and Shift-Enter; keep only Shift-Enter so
    // the "milestone.comment" command gets ⌘↵.
    // https://tiptap.dev/docs/editor/extensions/custom-extensions/extend-existing
    HardBreak.extend({
      addKeyboardShortcuts() {
        return { "Shift-Enter": () => this.editor.commands.setHardBreak() }
      },
    }),
    Mention.configure({
      suggestion: {
        char: "@",
        // Frappe answers a blank search with nobody, so a bare "@" opens the
        // list asking for a name and sends no request.
        minQueryLength: 1,
        items: async ({ query, signal }) => {
          try {
            const found = await search(query)
            if (!signal.aborted) failedQuery = null
            return found
          } catch (error) {
            if (!signal.aborted) failedQuery = query
            throw error
          }
        },
        render: renderMentionList((query) => query === failedQuery),
      },
    }),
  ]
}
