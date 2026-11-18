import * as React from "react"

// Whether a record page's title has scrolled up under the phone header, so
// the header can show the record instead of its section (Paper: Task detail
// 2 — scrolled). DetailLayout watches its title; ProjectHeader reads this.

let hidden = false
const listeners = new Set<() => void>()

export function setDetailHeadHidden(next: boolean) {
  if (next === hidden) return
  hidden = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useDetailHeadHidden(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false
  )
}
