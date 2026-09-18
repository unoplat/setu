import * as React from "react"
import { normalizeHotkey, validateHotkey } from "@tanstack/react-hotkeys"

import {
  COMMANDS,
  getCommand,
  isCommandId,
  listCommands,
  type Binding,
  type CommandDefinition,
  type CommandId,
} from "./registry"

/**
 * Effective bindings = registry defaults + per-user overrides.
 *
 * Overrides are stored in localStorage under one key. `null` means the user
 * unbound the command. Anything malformed is dropped on load so a bad entry
 * can never wedge the app.
 */

const STORAGE_KEY = "envision:command-bindings"

type Overrides = Partial<Record<CommandId, Binding | null>>

const listeners = new Set<() => void>()
let overrides: Overrides = load()
let version = 0

function load(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const result: Overrides = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (!isCommandId(id)) continue
      if (value === null) {
        result[id] = null
      } else if (isBinding(value)) {
        result[id] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

function persist() {
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
    }
  } catch {
    // Private mode or blocked storage: overrides stay in memory for the session.
  }
}

function isBinding(value: unknown): value is Binding {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<Binding>
  if (candidate.kind === "hotkey") {
    return (
      typeof candidate.hotkey === "string" &&
      validateHotkey(candidate.hotkey).valid
    )
  }
  if (candidate.kind === "sequence") {
    return (
      Array.isArray(candidate.keys) &&
      candidate.keys.length > 0 &&
      candidate.keys.every(
        (key) => typeof key === "string" && validateHotkey(key).valid
      )
    )
  }
  return false
}

function emit() {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getBinding(id: CommandId): Binding | null {
  return Object.hasOwn(overrides, id)
    ? (overrides[id] ?? null)
    : COMMANDS[id].defaultBinding
}

export function isCustomized(id: CommandId): boolean {
  return Object.hasOwn(overrides, id)
}

export function setBinding(id: CommandId, binding: Binding | null) {
  const next = { ...overrides, [id]: binding }
  // Setting a command back to its default drops the override entirely.
  if (bindingKey(binding) === bindingKey(COMMANDS[id].defaultBinding)) {
    delete next[id]
  }
  overrides = next
  persist()
  emit()
}

export function resetBinding(id: CommandId) {
  if (!Object.hasOwn(overrides, id)) return
  const next = { ...overrides }
  delete next[id]
  overrides = next
  persist()
  emit()
}

export function resetAllBindings() {
  overrides = {}
  persist()
  emit()
}

/** Canonical string for equality checks (`Mod+Shift+E`, `G P`). */
export function bindingKey(binding: Binding | null): string | null {
  if (!binding) return null
  if (binding.kind === "hotkey") return normalizeHotkey(binding.hotkey)
  return binding.keys.map((key) => normalizeHotkey(key)).join(" ")
}

/** Normalised chords of a binding; a plain hotkey is a one-step sequence. */
function bindingSteps(binding: Binding | null): string[] {
  if (!binding) return []
  const keys = binding.kind === "hotkey" ? [binding.hotkey] : binding.keys
  return keys.map((key) => normalizeHotkey(key))
}

/**
 * Two bindings collide when one is a prefix of the other (equal included):
 * `G` fires on the first key of `G then T`, so the sequence can never finish
 * without also running the single-key command.
 */
function stepsCollide(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.every((step, index) => step === long[index])
}

function scopesOverlap(a: CommandDefinition, b: CommandDefinition) {
  return a.scope === b.scope || a.scope === "global" || b.scope === "global"
}

/**
 * Commands that would fire on the same keys as `binding` if it were assigned
 * to `id`. Only commands whose scopes can be active at the same time count;
 * two modal dialogs can happily share `Escape`.
 */
export function findConflicts(
  id: CommandId,
  binding: Binding | null
): CommandDefinition[] {
  const steps = bindingSteps(binding)
  if (steps.length === 0) return []
  const self = getCommand(id)
  return listCommands().filter(
    (other) =>
      other.id !== id &&
      scopesOverlap(self, other) &&
      stepsCollide(steps, bindingSteps(getBinding(other.id)))
  )
}

/** React subscription to one command's effective binding. */
export function useBinding(id: CommandId): Binding | null {
  return React.useSyncExternalStore(subscribe, () => getBinding(id))
}

/** Re-renders whenever any binding changes; returns a monotonic version. */
export function useBindingsVersion(): number {
  return React.useSyncExternalStore(subscribe, () => version)
}
