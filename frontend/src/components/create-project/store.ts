import * as React from "react"

/**
 * Open state of the Create Project wizard. One dialog instance lives in the
 * app shell; buttons, the palette and the `project.new` command all call
 * `openCreateProject()` instead of owning their own dialog.
 */

const listeners = new Set<() => void>()
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

export function openCreateProject() {
  if (open) return
  open = true
  emit()
}

export function closeCreateProject() {
  if (!open) return
  open = false
  emit()
}

export function useCreateProjectOpen(): boolean {
  return React.useSyncExternalStore(subscribe, () => open)
}
