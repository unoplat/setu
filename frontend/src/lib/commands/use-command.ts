import { useHotkeys, useHotkeySequences } from "@tanstack/react-hotkeys"

import { useBinding } from "./bindings"
import { getCommand, type CommandId } from "./registry"
import { isScopeEnabled, useScopeStack } from "./scopes"

export interface UseCommandOptions {
  /** Extra condition on top of scope gating (for example "dialog is open"). */
  enabled?: boolean
}

/**
 * Wire a handler to a command. The keys come from the bindings store, the
 * scope from the registry; the caller only supplies behaviour.
 *
 * Both TanStack hooks accept arrays, so a command bound to a chord, a
 * sequence, or nothing at all keeps the same hook order across renders.
 * Conflicts between commands are resolved by scope gating here and surfaced
 * to the user in Settings, so the manager's own duplicate warning is off.
 */
export function useCommand(
  id: CommandId,
  handler: () => void,
  options: UseCommandOptions = {}
) {
  const spec = getCommand(id)
  const binding = useBinding(id)
  const stack = useScopeStack()
  const enabled = (options.enabled ?? true) && isScopeEnabled(spec.scope, stack)

  const common = {
    enabled,
    ignoreInputs: spec.ignoreInputs,
    conflictBehavior: "allow" as const,
    meta: { name: spec.title, description: spec.description },
  }

  useHotkeys(
    binding?.kind === "hotkey"
      ? [{ hotkey: binding.hotkey, callback: () => handler() }]
      : [],
    common
  )

  useHotkeySequences(
    binding?.kind === "sequence"
      ? [{ sequence: binding.keys, callback: () => handler() }]
      : [],
    common
  )
}
