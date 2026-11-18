import * as React from "react"

import { closePalette } from "@/components/search/store"

/**
 * Back closes Search on a phone (Paper: Search · 10 Back / close).
 *
 * Opening Search on a phone adds one history entry at the same address,
 * marked `envisionSearch`. Android's Back, iOS's edge swipe and the browser's
 * Back step off it, which closes Search and leaves the page under it as it
 * was. Closing Search any other way (Cancel, Esc) steps back off the entry
 * too, so the history holds no Search entries once it is closed.
 *
 * - The entry is added with the History prototype's own pushState, not the
 *   router's, so the router keeps its location. A step from Search's entry
 *   back to the page under it is caught here before the router hears of it,
 *   so the page is not reloaded or scrolled to the top.
 * - Any other step (a long press on Back that jumps several pages, Forward)
 *   closes Search and is left to the router, so the address and the page
 *   stay in step.
 * - A pick (open a Task, Go to Inbox) runs once the entry is gone, so Back
 *   from where it lands returns to the page under Search, never to Search.
 *   If the browser never reports the step, the pick runs anyway shortly after.
 * - An entry left behind (Forward after Back, or a reload while Search was
 *   open) is stepped off again as soon as it is reached.
 */

type EntryState = "none" | "open" | "leaving"

/** How long a step back off the entry may take before a pick runs anyway. */
const LEAVE_FALLBACK_MS = 400

let entry: EntryState = "none"
// The page under Search: the entry Back from Search's entry lands on.
let underKey: unknown = undefined
let afterLeaving: (() => void) | null = null
// Search was opened again before the step off its last entry arrived.
let reenter = false
let fallback: ReturnType<typeof setTimeout> | undefined

function isSearchEntry(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    "envisionSearch" in state &&
    state.envisionSearch === true
  )
}

function historyKey(state: unknown): unknown {
  return typeof state === "object" && state !== null && "key" in state
    ? state.key
    : undefined
}

/** Adds Search's history entry, once per opening. */
export function enterSearchEntry() {
  if (entry === "leaving") reenter = true
  if (entry !== "none") return
  const state = window.history.state as Record<string, unknown> | null
  underKey = historyKey(state)
  History.prototype.pushState.call(
    window.history,
    { ...state, envisionSearch: true },
    ""
  )
  entry = "open"
}

/** The entry is gone: run the pick, and add it again for a new opening. */
function settle({ close }: { close: boolean }) {
  clearTimeout(fallback)
  fallback = undefined
  // Before closing: closing steps off the entry, which is already gone.
  entry = "none"
  if (close && !reenter) closePalette()
  const then = afterLeaving
  afterLeaving = null
  then?.()
  if (reenter) {
    reenter = false
    enterSearchEntry()
  }
}

/**
 * Steps back off Search's entry, then runs `then`. With no entry (desktop,
 * or already left) `then` runs at once.
 */
export function leaveSearchEntry(then?: () => void) {
  if (entry === "none") {
    then?.()
    return
  }
  if (then) afterLeaving = then
  if (entry === "leaving") return
  entry = "leaving"
  window.history.back()
  fallback = setTimeout(() => settle({ close: false }), LEAVE_FALLBACK_MS)
}

function onPopState(event: PopStateEvent) {
  if (entry === "none") {
    // Reached an entry left behind: step off it without telling the router,
    // whose location is the page under it.
    if (isSearchEntry(event.state)) {
      event.stopImmediatePropagation()
      window.history.back()
    }
    return
  }
  const backToPageUnder = historyKey(event.state) === underKey
  // Search's own step: the router never moved, so it must not see it.
  if (backToPageUnder) event.stopImmediatePropagation()
  // Back closes Search; a new opening waiting for this step keeps it open.
  settle({ close: true })
}

/** Listens for Back while Search is open. Mount once, with the palette. */
export function usePhoneSearchHistory() {
  React.useEffect(() => {
    // A reload while Search was open keeps its entry; step off it first.
    if (isSearchEntry(window.history.state)) window.history.back()
    // Capture runs ahead of the router's listener on the same target.
    window.addEventListener("popstate", onPopState, { capture: true })
    return () =>
      window.removeEventListener("popstate", onPopState, { capture: true })
  }, [])
}
