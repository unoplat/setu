import { HardBreak } from "@tiptap/extension-hard-break"
import { Placeholder } from "@tiptap/extensions"
import { Mention } from "reactjs-tiptap-editor/mention"

import { descriptionExtensions } from "@/components/create-project/description-extensions"
import type { FrappeConfig } from "frappe-react-sdk"

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
 */
export async function searchMentions(
  call: FrappeConfig["call"],
  query: string
): Promise<MentionSuggestion[]> {
  try {
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
  } catch {
    return []
  }
}

/** Built once per editor, around a search that `@` calls as the user types. */
export function commentExtensions(
  search: (query: string) => Promise<MentionSuggestion[]>
) {
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
        items: ({ query }: { query: string }) => search(query),
      },
    }),
  ]
}
