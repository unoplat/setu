import { useFrappeGetCall, type SWRConfiguration } from "frappe-react-sdk"

/**
 * Search across projects for the ⌘K dialog (setu/api/search.py). Tasks,
 * modules and milestones match on their title or description; the dialog
 * shows them grouped by kind, in `RECORD_GROUPS` order.
 */

export type RecordType = "task" | "module" | "milestone"

/** A stretch of the description, `match` where the query was found. */
export interface ExcerptPart {
  text: string
  match: boolean
}

export interface SearchResult {
  type: RecordType
  name: string
  title: string
  project: string
  project_name: string | null
  /** ERPNext's Task status; null for a module. */
  status: string | null
  matched_in: ("title" | "description")[]
  excerpt: ExcerptPart[]
}

export interface SearchResponse {
  results: SearchResult[]
  /** The index is still being built, so nothing could be searched yet. */
  indexing: boolean
  /** Set when nothing matched as typed and a spelling fix found results. */
  corrected_query: string | null
}

/** The server searches from the second letter (MIN_QUERY_LENGTH there too). */
export const MIN_QUERY_LENGTH = 2

export const RECORD_GROUPS: readonly { type: RecordType; heading: string }[] = [
  { type: "task", heading: "Tasks" },
  { type: "module", heading: "Modules" },
  { type: "milestone", heading: "Milestones" },
]

export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH
}

/** Results by kind, in the dialog's order, leaving out empty kinds. */
export function groupResults(results: readonly SearchResult[]) {
  return RECORD_GROUPS.map((group) => ({
    ...group,
    results: results.filter((result) => result.type === group.type),
  })).filter((group) => group.results.length > 0)
}

/**
 * Whether a project or action named `title` should lead the results: one of
 * its words starts with the query ("set" → "Go to Settings"), or the whole
 * query appears in it when the query has several words.
 */
export function nameLeads(title: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return false
  const name = title.toLocaleLowerCase()
  if (/\s/.test(needle)) return name.includes(needle)
  return name.split(/\s+/).some((word) => word.startsWith(needle))
}

// A search is asked for once per query: no refetch on focus, and the last
// results stay on screen while the next query loads, so the list does not
// flash empty between keystrokes.
const SEARCH: SWRConfiguration = {
  keepPreviousData: true,
  revalidateOnFocus: false,
  revalidateIfStale: false,
}

export function useRecordSearch(query: string) {
  const text = query.trim()
  return useFrappeGetCall<{ message: SearchResponse }>(
    "setu.api.search.search",
    { text },
    // A null key fetches nothing, below the second letter.
    isSearchable(text) ? ["envision:search", text] : null,
    SEARCH
  )
}
