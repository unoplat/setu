"use client"

import { useQueryStates, type ParserBuilder } from "nuqs"
import { useCallback, useLayoutEffect, useMemo, useRef } from "react"
import type { InternalStoreAdapter } from "../../adapter/types"
import {
  getSchemaDefaults,
  isStateEqual,
  validateState,
} from "../../schema/serialization"
import type { SchemaDefinition, StoreSnapshot } from "../../schema/types"
import { schemaToNuqsParsers } from "./parser-bridge"
import type { NuqsAdapterOptions } from "./types"

export type { NuqsAdapterOptions } from "./types"

/**
 * Create a nuqs adapter for URL-based state management
 *
 * @example
 * ```typescript
 * const schema = createSchema({
 *   regions: field.array(field.string()).default([]),
 *   host: field.string(),
 * });
 *
 * function MyComponent() {
 *   const adapter = useNuqsAdapter(schema.definition, { id: 'my-table' });
 *   return (
 *     <DataTableStoreProvider adapter={adapter}>
 *       <DataTable />
 *     </DataTableStoreProvider>
 *   );
 * }
 * ```
 */
export function useNuqsAdapter<T extends Record<string, unknown>>(
  schema: SchemaDefinition,
  options: NuqsAdapterOptions<T>
): InternalStoreAdapter<T> {
  const {
    id,
    initialState,
    shallow = true,
    history = "push",
    scroll = false,
    throttleMs = 50,
  } = options

  const parsers = useMemo(() => schemaToNuqsParsers(schema), [schema])
  const defaults = useMemo(() => getSchemaDefaults(schema) as T, [schema])

  // Use nuqs hook
  const [nuqsState, setNuqsState] = useQueryStates(
    parsers as Record<string, ParserBuilder<unknown>>,
    {
      shallow,
      history,
      scroll,
      throttleMs,
    }
  )

  const listenersRef = useRef(new Set<() => void>())
  const pausedRef = useRef(false)
  const pendingStateRef = useRef<Partial<T> | null>(null)

  // Cache server snapshot to avoid infinite loop with useSyncExternalStore
  const serverSnapshotRef = useRef<StoreSnapshot<T>>({
    state: { ...defaults, ...initialState } as T,
    version: 0,
  })

  // Compute merged state once per render so validateState isn't called twice
  const currentState = useMemo(() => {
    const validated = validateState(schema, nuqsState) as T
    return { ...defaults, ...initialState, ...validated } as T
  }, [nuqsState, schema, defaults, initialState])

  // Seed URL-derived state on the first client render, then publish at commit.
  const snapshotRef = useRef<StoreSnapshot<T>>({
    state: currentState,
    version: 0,
  })

  // nuqs does not guarantee setter identity. Keep adapter/actions stable while
  // routing writes through the latest committed setter.
  const setNuqsStateRef = useRef(setNuqsState)

  const publish = useCallback((state: T) => {
    const previous = snapshotRef.current
    if (isStateEqual(previous.state, state)) return

    snapshotRef.current = {
      state,
      version: previous.version + 1,
    }
    listenersRef.current.forEach((listener) => listener())
  }, [])

  useLayoutEffect(() => {
    // A listener may write state, so refresh the setter before notifying it.
    setNuqsStateRef.current = setNuqsState
    publish(currentState)
  }, [currentState, setNuqsState, publish])

  // Create stable adapter reference
  const adapter = useMemo<InternalStoreAdapter<T>>(() => {
    return {
      subscribe(listener: () => void) {
        listenersRef.current.add(listener)
        return () => {
          listenersRef.current.delete(listener)
        }
      },

      getSnapshot(): StoreSnapshot<T> {
        return snapshotRef.current
      },

      getServerSnapshot(): StoreSnapshot<T> {
        // Return cached snapshot to avoid infinite loop with useSyncExternalStore
        return serverSnapshotRef.current
      },

      setState(partial: Partial<T>) {
        if (pausedRef.current) {
          pendingStateRef.current = {
            ...pendingStateRef.current,
            ...partial,
          }
          return
        }

        // Convert undefined values to null for nuqs
        const nuqsPartial: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(partial)) {
          nuqsPartial[key] = value === undefined ? null : value
        }

        setNuqsStateRef.current((prev) => ({ ...prev, ...nuqsPartial }))
      },

      setField<K extends keyof T>(key: K, value: T[K]) {
        this.setState({ [key]: value } as unknown as Partial<T>)
      },

      reset(fields?: (keyof T)[]) {
        if (fields) {
          const resetPartial: Partial<T> = {}
          for (const field of fields) {
            resetPartial[field] = defaults[field]
          }
          this.setState(resetPartial)
        } else {
          this.setState(defaults)
        }
      },

      pause() {
        pausedRef.current = true
      },

      resume() {
        pausedRef.current = false
        if (pendingStateRef.current) {
          this.setState(pendingStateRef.current)
          pendingStateRef.current = null
        }
      },

      isPaused() {
        return pausedRef.current
      },

      destroy() {
        listenersRef.current.clear()
      },

      getTableId() {
        return id
      },

      getSchema() {
        return schema
      },

      getDefaults() {
        return defaults
      },

      // Internal methods for provider sync
      _syncState(state: T) {
        publish(state)
      },
    }
  }, [id, schema, defaults, publish])

  return adapter
}

// Re-export parser bridge utilities for advanced use cases
export { schemaToNuqsParsers, createSchemaSerializer } from "./parser-bridge"

// Re-export nuqs types for components that need them
// This allows components to import from the adapter layer instead of nuqs directly
export type { ParserBuilder } from "nuqs"
