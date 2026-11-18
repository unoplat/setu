import * as React from "react"

/**
 * The part of the screen the on-screen keyboard leaves visible, while
 * `active`: its height and its offset from the top of the page. Undefined
 * where the browser has no visualViewport, while inactive, and while the page
 * is pinch-zoomed, when the visual viewport no longer measures the keyboard.
 */
export function useVisualViewport(active: boolean) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const viewport = window.visualViewport
      if (!active || !viewport) return () => {}
      viewport.addEventListener("resize", onChange)
      viewport.addEventListener("scroll", onChange)
      return () => {
        viewport.removeEventListener("resize", onChange)
        viewport.removeEventListener("scroll", onChange)
      }
    },
    [active]
  )
  const measured = () => {
    const viewport = window.visualViewport
    return active && viewport?.scale === 1 ? viewport : undefined
  }
  const height = React.useSyncExternalStore(subscribe, () => measured()?.height)
  const top = React.useSyncExternalStore(subscribe, () => measured()?.offsetTop)
  return { height, top }
}
