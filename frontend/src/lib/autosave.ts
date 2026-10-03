import * as React from "react"
import { useStore } from "@tanstack/react-form"
import { useBlocker } from "@tanstack/react-router"
import type { FrappeError } from "frappe-react-sdk"

import { useAppForm } from "@/lib/form"
import { frappeErrorMessage } from "@/lib/frappe-error"

/**
 * Autosave for a record page (Paper: 06d, 07d, 09): no Save button, every
 * edit is sent on its own and the page says "Saved".
 *
 * TanStack Form supplies the pieces its Listeners guide describes for this:
 * field `listeners` trigger a save on change (debounced for typing) and on
 * blur, and `form.handleSubmit()` runs the validators first, so an invalid
 * edit is never sent.
 * https://tanstack.com/form/latest/docs/framework/react/guides/listeners
 *
 * What the form does not do is kept here: one save at a time with later
 * edits folded into the next one, what "saved" currently means (`base`), and
 * holding a navigation until the last edit has landed.
 */

export type AutosaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "invalid"
  | "error"
  | "conflict"

/** How a field changed here and elsewhere at once is settled. */
export type ConflictChoice = "mine" | "theirs"

/** Form values here are strings and lists of strings. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  }
  return a === b
}

/** The fields whose value is not what the server has. */
export function pendingFields<T extends object>(
  values: T,
  base: T
): (keyof T)[] {
  return (Object.keys(base) as (keyof T)[]).filter(
    (field) => !sameValue(values[field], base[field])
  )
}

/**
 * What the form should take from the server's copy (`saved`): each field the
 * user has not touched since, where the server kept something else (Frappe
 * cleans HTML, de-duplicates tags, someone edited it in Desk). "Not touched
 * since" is still what was sent for a sent field, and still the old `base`
 * for the rest. A field edited meanwhile keeps the user's value and stays
 * pending.
 */
export function adoptable<T extends object>(input: {
  values: T
  base: T
  sent?: Partial<T>
  saved: T
}): Partial<T> {
  const { values, base, sent, saved } = input
  const result: Partial<T> = {}
  for (const field of Object.keys(saved) as (keyof T)[]) {
    const reference = sent && field in sent ? sent[field] : base[field]
    if (
      sameValue(values[field], reference) &&
      !sameValue(values[field], saved[field])
    ) {
      result[field] = saved[field]
    }
  }
  return result
}

/**
 * The fields changed here and elsewhere at once: the user has an edit pending
 * (`values` is not `base`), and the server's copy (`saved`) has moved on from
 * `base` to something else again. Saving the edit would quietly undo the
 * other change, so it waits for the user to pick one.
 */
export function conflicting<T extends object>(input: {
  values: T
  base: T
  saved: T
}): (keyof T)[] {
  const { values, base, saved } = input
  return (Object.keys(saved) as (keyof T)[]).filter(
    (field) =>
      !sameValue(values[field], base[field]) &&
      !sameValue(saved[field], base[field]) &&
      !sameValue(values[field], saved[field])
  )
}

/** How long typing pauses before it is saved. */
const TYPING_DEBOUNCE_MS = 800

const ADOPT = {
  dontUpdateMeta: true,
  dontRunListeners: true,
  dontValidate: true,
} as const

function unchanged<T>(values: T): T {
  return values
}

export function useAutosaveForm<T extends object>({
  saved,
  prepare = unchanged,
  save,
}: {
  /** The record as the server has it, in the form's shape. */
  saved: T
  /** Values as they are sent and compared, e.g. the title trimmed. */
  prepare?: (values: T) => T
  /**
   * Send the changed fields and return the record the server kept. Throws
   * when the save fails.
   */
  save: (changes: Partial<T>) => Promise<T>
}) {
  // `base` is what the server has. The ref is for the code that runs between
  // renders (a save finishing, the leave guard).
  const [base, setBase] = React.useState(saved)
  const baseRef = React.useRef(saved)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)
  const [running, setRunning] = React.useState(false)
  // Fields in conflict are left out of every save until they are settled.
  const [conflicts, setConflicts] = React.useState<(keyof T)[]>([])
  const conflictsRef = React.useRef<(keyof T)[]>([])
  // How many times each field's value was replaced from outside (a change
  // made elsewhere, or "theirs" picked), for a control that keeps its own
  // copy of the value, like the description's editor.
  const [replaced, setReplaced] = React.useState<
    Partial<Record<keyof T, number>>
  >({})
  // The fields of the save in flight: its result is the user's own edit
  // coming back, not a change made elsewhere.
  const sending = React.useRef<Partial<T> | null>(null)

  const latest = React.useRef({ prepare, save })
  React.useEffect(() => {
    latest.current = { prepare, save }
  })

  function moveBase(next: T) {
    baseRef.current = next
    setBase(next)
  }

  function moveConflicts(next: (keyof T)[]) {
    conflictsRef.current = next
    setConflicts(next)
  }

  function markReplaced(fields: (keyof T)[]) {
    if (fields.length === 0) return
    setReplaced((current) => {
      const next = { ...current }
      for (const field of fields) next[field] = (next[field] ?? 0) + 1
      return next
    })
  }

  const form = useAppForm({
    defaultValues: base,
    onSubmit: async ({ value, formApi }) => {
      const { prepare, save } = latest.current
      const sentFrom = baseRef.current
      const prepared = prepare(value)
      const fields = pendingFields(prepared, sentFrom).filter(
        (field) => !conflictsRef.current.includes(field)
      )
      if (fields.length === 0) {
        setFailure(null)
        return
      }
      const sent = Object.fromEntries(
        fields.map((field) => [field, prepared[field]])
      ) as Partial<T>
      sending.current = sent
      try {
        const next = await save(sent)
        const adopt = adoptable({
          values: prepare(formApi.state.values),
          base: sentFrom,
          sent,
          saved: next,
        })
        for (const [field, fieldValue] of Object.entries(adopt)) {
          formApi.setFieldValue(field as never, fieldValue as never, ADOPT)
        }
        moveBase(next)
        setFailure(null)
        setSavedAt(Date.now())
      } catch (error) {
        setFailure(frappeErrorMessage(error as FrappeError))
      } finally {
        sending.current = null
      }
    },
  })

  // The record changed underneath (revalidated after an edit in Desk, on the
  // Board or in another tab): take the new values wherever the user has no
  // edit pending, and hold back the edits the change collides with.
  React.useEffect(() => {
    const current = baseRef.current
    if (pendingFields(saved, current).length === 0) return
    const values = latest.current.prepare(form.state.values)
    const adopt = adoptable({ values, base: current, saved })
    for (const [field, fieldValue] of Object.entries(adopt)) {
      form.setFieldValue(field as never, fieldValue as never, ADOPT)
    }
    const inFlight = sending.current ?? {}
    const collided = conflicting({ values, base: current, saved }).filter(
      (field) => !(field in inFlight) && !conflictsRef.current.includes(field)
    )
    if (collided.length > 0) {
      moveConflicts([...conflictsRef.current, ...collided])
    }
    markReplaced(Object.keys(adopt) as (keyof T)[])
    baseRef.current = saved
    setBase(saved)
  }, [saved, form])

  // One save at a time. `handleSubmit` never refuses a second call, so an
  // edit made while a save is in flight asks for one more pass instead, which
  // sends whatever is still different by then.
  const queue = React.useRef<{ promise: Promise<void> | null; again: boolean }>(
    { promise: null, again: false }
  )
  const flush = React.useCallback((): Promise<void> => {
    const state = queue.current
    if (state.promise) {
      state.again = true
      return state.promise
    }
    setRunning(true)
    state.promise = (async () => {
      try {
        do {
          state.again = false
          await form.handleSubmit()
        } while (state.again)
      } finally {
        state.promise = null
        setRunning(false)
      }
    })()
    return state.promise
  }, [form])

  const pendingNow = React.useCallback(
    () =>
      pendingFields(latest.current.prepare(form.state.values), baseRef.current)
        .length > 0,
    [form]
  )

  const pending = useStore(
    form.store,
    (state) => pendingFields(prepare(state.values as T), base).length > 0
  )
  const valid = useStore(form.store, (state) => state.isValid)

  /**
   * Settle the fields in conflict (all of them, or `fields`): "theirs" takes
   * the server's copy, "mine" saves the edit over it.
   */
  const resolveConflicts = React.useCallback(
    (choice: ConflictChoice, fields?: (keyof T)[]) => {
      const settled = conflictsRef.current.filter(
        (field) => !fields || fields.includes(field)
      )
      if (settled.length === 0) return
      if (choice === "theirs") {
        for (const field of settled) {
          form.setFieldValue(
            field as never,
            baseRef.current[field] as never,
            ADOPT
          )
        }
        markReplaced(settled)
      }
      moveConflicts(
        conflictsRef.current.filter((field) => !settled.includes(field))
      )
      if (choice === "mine") void flush()
    },
    [form, flush]
  )

  const status: AutosaveStatus = running
    ? "saving"
    : conflicts.length > 0
      ? "conflict"
      : !pending
        ? savedAt === null
          ? "idle"
          : "saved"
        : !valid
          ? "invalid"
          : failure !== null
            ? "error"
            : // Typed, and the debounce has not fired yet.
              "saving"

  // Leaving waits for the last edit to land, and only asks when it could not
  // be saved. https://tanstack.com/router/latest/docs/framework/react/guide/navigation-blocking
  const blocker = useBlocker({
    shouldBlockFn: async () => {
      if (!pendingNow() && !queue.current.promise) return false
      await flush()
      return pendingNow()
    },
    enableBeforeUnload: () => pendingNow() || queue.current.promise !== null,
    withResolver: true,
  })

  // Field `listeners`: a picker saves as soon as it changes; typing saves
  // after a pause and when the field is left.
  const listeners = React.useMemo(() => {
    const trigger = () => void flush()
    return {
      picked: { onChange: trigger },
      typed: {
        onChange: trigger,
        onChangeDebounceMs: TYPING_DEBOUNCE_MS,
        onBlur: trigger,
      },
    }
  }, [flush])

  return {
    form,
    status,
    /** Fields edited here while someone changed them elsewhere; not saved. */
    conflicts,
    resolveConflicts,
    /** Per field, a count that moves each time its value is replaced from outside. */
    replaced,
    /** Why the last save failed, while its edits are still unsaved. */
    error: status === "error" ? failure : null,
    savedAt,
    /** Save now, without waiting for the debounce; resolves when idle. */
    flush,
    listeners,
    /** Set while a navigation is held because the edits could not be saved. */
    leaving:
      blocker.status === "blocked"
        ? {
            stay: () => blocker.reset(),
            discard: () => blocker.proceed(),
            retry: async () => {
              await flush()
              if (!pendingNow()) blocker.proceed()
            },
          }
        : null,
  }
}

export type AutosaveListeners = ReturnType<typeof useAutosaveForm>["listeners"]
