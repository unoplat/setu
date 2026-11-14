import * as React from "react"

/**
 * Open state of the search palette. One palette lives in the app shell
 * (search-palette.tsx); the sidebar's Search row, the phone tab bar and the
 * `palette.open` command all call these instead of owning their own dialog.
 */

const listeners = new Set<() => void>()
const changeHandlers = new Set<(open: boolean) => void>()
let open = false

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setPaletteOpen(next: boolean) {
  if (next === open) return
  // Synchronously, in the caller's event, ahead of the palette's next render.
  for (const handler of changeHandlers) handler(next)
  open = next
  emit()
}

export function openPalette() {
  setPaletteOpen(true)
}

export function closePalette() {
  setPaletteOpen(false)
}

export function togglePalette() {
  setPaletteOpen(!open)
}

export function usePaletteOpen(): boolean {
  return React.useSyncExternalStore(subscribe, () => open)
}

/**
 * Runs `handler` each time the palette opens or closes, synchronously in the
 * event that did it, before the palette renders the change. The palette
 * resets its query and, on opening, forgets earlier search answers here.
 */
export function usePaletteOpenChange(handler: (open: boolean) => void) {
  // The latest handler, so it is registered once rather than every render.
  const latest = React.useRef(handler)
  React.useLayoutEffect(() => {
    latest.current = handler
  })
  React.useEffect(() => {
    const run = (next: boolean) => latest.current(next)
    changeHandlers.add(run)
    return () => {
      changeHandlers.delete(run)
    }
  }, [])
}
