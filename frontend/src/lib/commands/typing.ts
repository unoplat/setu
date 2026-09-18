import * as React from "react"

/**
 * Whether keyboard focus is in something the user types into. TanStack's
 * `ignoreInputs` applies this rule to hotkeys, but `useKeyHold` tracks keys
 * everywhere, so held-key UI has to check it for itself.
 */
function isTypingTarget(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLInputElement) {
    return !["button", "submit", "reset", "checkbox", "radio"].includes(
      element.type
    )
  }
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
}

function subscribe(onChange: () => void) {
  document.addEventListener("focusin", onChange)
  document.addEventListener("focusout", onChange)
  return () => {
    document.removeEventListener("focusin", onChange)
    document.removeEventListener("focusout", onChange)
  }
}

/** True while an input, textarea, select or contenteditable has focus. */
export function useIsTyping(): boolean {
  return React.useSyncExternalStore(subscribe, () =>
    isTypingTarget(document.activeElement)
  )
}
