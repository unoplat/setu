import * as React from "react"

import { SCOPES, type CommandScope } from "./registry"

/**
 * Scope stack. Components push a scope while mounted (a dialog pushes
 * `create-project`), and commands consult the stack to decide whether they
 * are currently enabled. This keeps hotkey registrations stable (TanStack
 * only toggles `enabled`) instead of mounting and unmounting listeners.
 */

const listeners = new Set<() => void>()
let stack: readonly CommandScope[] = []

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function pushScope(scope: CommandScope): () => void {
  stack = [...stack, scope]
  emit()
  return () => {
    const index = stack.lastIndexOf(scope)
    if (index === -1) return
    stack = [...stack.slice(0, index), ...stack.slice(index + 1)]
    emit()
  }
}

export function getScopeStack(): readonly CommandScope[] {
  return stack
}

/** Whether commands in `scope` may fire given the current stack. */
export function isScopeEnabled(
  scope: CommandScope,
  current: readonly CommandScope[] = stack
): boolean {
  const top = current.at(-1)
  if (!top) return scope === "global"
  if (SCOPES[top].modal) return scope === top
  return scope === "global" || current.includes(scope)
}

/** Keep `scope` on the stack while the component is mounted and `active`. */
export function useScope(scope: CommandScope, active = true) {
  React.useEffect(() => {
    if (!active) return undefined
    return pushScope(scope)
  }, [scope, active])
}

export function useScopeStack(): readonly CommandScope[] {
  return React.useSyncExternalStore(subscribe, getScopeStack)
}
