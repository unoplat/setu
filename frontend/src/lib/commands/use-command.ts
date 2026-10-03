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
  handler: (event: KeyboardEvent) => void,
  options: UseCommandOptions = {}
) {
  const spec = getCommand(id)
  const binding = useBinding(id)
  const stack = useScopeStack()
  const enabled = (options.enabled ?? true) && isScopeEnabled(spec.scope, stack)

  // `ignoreInputs` is only passed when the registry overrides it. The hooks
  // re-apply options on every render with `setOptions`, which merges by
  // spread, so an explicit `undefined` would erase the smart default TanStack
  // resolved at registration (Mod chords and Escape fire inside inputs).
  const common = {
    enabled,
    ...(spec.ignoreInputs === undefined
      ? {}
      : { ignoreInputs: spec.ignoreInputs }),
    conflictBehavior: "allow" as const,
    meta: { name: spec.title, description: spec.description },
  }

  useHotkeys(
    binding?.kind === "hotkey"
      ? [{ hotkey: binding.hotkey, callback: (event) => handler(event) }]
      : [],
    common
  )

  useHotkeySequences(
    binding?.kind === "sequence"
      ? [{ sequence: binding.keys, callback: (event) => handler(event) }]
      : [],
    common
  )
}
