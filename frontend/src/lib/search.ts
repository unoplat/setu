import * as React from "react"
import { useFrappeGetCall, type SWRConfiguration } from "frappe-react-sdk"

/**
 * Search across projects for the ⌘K dialog (setu/api/search.py). Tasks,
 * modules and milestones match on their title or description; links on their
 * name, description, type and host (never the rest of the address). The
 * dialog shows them grouped by kind, in `RECORD_GROUPS` order.
 */

export type RecordType = "task" | "module" | "milestone" | "link"

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
  /** ERPNext's Task status; null for a module, milestone or link. */
  status: string | null
  /** A link's host or type match reports as "description". */
  matched_in: ("title" | "description")[]
  excerpt: ExcerptPart[]
  /** A link's host, its type's name and that type's icon key. */
  host?: string | null
  link_type_name?: string | null
  icon?: string | null
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
  { type: "link", heading: "Links" },
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

// While the index is being built, the dialog asks again this often.
const INDEXING_RETRY_MS = 5000

// Within one opening of the dialog a query is asked for once, so typing back
// to it reuses the answer; the dialog forgets every answer as it opens
// (isSearchKey). A query on screen is asked again when the window regains
// focus (at most every few seconds), so edits made meanwhile can show up.
// SWR's keepPreviousData is not used: its kept answer outlives openings and
// would stand in for the current query's own (see useRecordSearch).
const SEARCH: SWRConfiguration<{ message: SearchResponse }> = {
  revalidateOnFocus: true,
  revalidateIfStale: false,
}

const SEARCH_KEY = "envision:search"

/** Matches every cached search answer, for `mutate`. */
export function isSearchKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === SEARCH_KEY
}

/**
 * The answer for `query`, asked once typing has settled.
 *
 * - The last answer stays on screen while the next query loads, so the list
 *   does not flash empty between keystrokes, but only within the opening it
 *   arrived in: `opening` changes each time the dialog opens.
 * - An "indexing" answer is asked again every INDEXING_RETRY_MS until the
 *   index is ready. The interval is a number taken from this query's own
 *   answer: the SDK's SWR reads a function interval only when it sets its
 *   timer, before an uncached answer has arrived, so it would never start.
 *   SWR skips these retries while the tab is hidden or offline.
 */
export function useRecordSearch(query: string, opening: number) {
  const text = query.trim()
  const [indexing, setIndexing] = React.useState(false)
  const search = useFrappeGetCall<{ message: SearchResponse }>(
    "setu.api.search.search",
    { text },
    // A null key fetches nothing, below the second letter.
    isSearchable(text) ? [SEARCH_KEY, text] : null,
    { ...SEARCH, refreshInterval: indexing ? INDEXING_RETRY_MS : 0 }
  )
  // This key's own answer: without keepPreviousData, never another query's.
  const answer = search.data?.message

  // Both follow the answer during render, so the interval and the kept answer
  // committed with it always belong to the current key and opening.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const answerIndexing = answer?.indexing ?? false
  if (answerIndexing !== indexing) setIndexing(answerIndexing)
  const [kept, setKept] = React.useState<{
    opening: number
    answer: SearchResponse
  }>()
  if (answer && (kept?.answer !== answer || kept.opening !== opening)) {
    setKept({ opening, answer })
  }

  return {
    response: answer ?? (kept?.opening === opening ? kept.answer : undefined),
    isLoading: search.isLoading,
    error: search.error,
  }
}
