"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core"
import { findItem } from "../lib/data"
import { samePlace, type KanbanPlace } from "../lib/drag-state"
import { canDrop } from "../lib/permissions"
import type { KanbanAction, KanbanData, KanbanItem } from "../types"

type Active =
  | { kind: "item"; item: KanbanItem; from: KanbanPlace }
  | { kind: "column"; columnId: string }
  | null

type ItemData = {
  kind: "item"
  columnId: string
  swimlaneId?: string
  rendererId: string
}

type ActiveData = ItemData | { kind: "column"; columnId: string } | undefined

type OverData =
  | ItemData
  | { kind: "cell"; columnId: string; swimlaneId?: string }
  | { kind: "collapsed-column"; columnId: string }
  | { kind: "column"; columnId: string }
  // Envision, rows layout: the header of a folded swimlane row.
  | { kind: "row"; swimlaneId: string }
  | undefined

/** How long a moved item stays marked after it lands. */
const LANDED_MS = 900

/**
 * The cell an item dragged from `from` would land in when released over
 * `over`. A target with no lane of its own (a collapsed column, the column
 * wrapper) keeps the item's lane, and one with no column (a folded row's
 * header) keeps its column.
 */
function placeOver(
  data: KanbanData,
  from: KanbanPlace,
  over: OverData
): KanbanPlace | null {
  if (!over) return null
  if (over.kind === "row") {
    return { columnId: from.columnId, swimlaneId: over.swimlaneId }
  }
  const swimlaneId = "swimlaneId" in over ? over.swimlaneId : undefined
  return {
    columnId: over.columnId,
    swimlaneId:
      swimlaneId === undefined && data.swimlanes?.length
        ? from.swimlaneId
        : swimlaneId,
  }
}

export function useDragHandlers({
  data,
  readOnly,
  itemDrag,
  dispatch,
  onItemMove,
}: {
  data: KanbanData
  readOnly: boolean
  /** Envision: items may be dragged (`!readOnly || allowItemDrag`). Columns follow `readOnly` alone. */
  itemDrag: boolean
  dispatch: (action: KanbanAction) => void
  onItemMove?: (
    item: KanbanItem,
    from: { columnId: string; swimlaneId?: string },
    to: { columnId: string; swimlaneId?: string }
  ) => void
}) {
  const [active, setActive] = useState<Active>(null)
  // Envision: where the dragged item would land, and the one that just did.
  const [target, setTarget] = useState<KanbanPlace | null>(null)
  const [landedId, setLandedId] = useState<string | null>(null)
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (landedTimer.current) clearTimeout(landedTimer.current)
    },
    []
  )

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = event.active.data.current as ActiveData
      if (!activeData) return
      if (activeData.kind === "item") {
        if (!itemDrag) return
        const found = findItem(data, String(event.active.id))
        if (found) {
          setActive({
            kind: "item",
            item: found.item,
            from: {
              columnId: found.columnId,
              // The lane the card is drawn in (an unknown one shows in the first).
              swimlaneId: activeData.swimlaneId,
            },
          })
        }
      } else if (activeData.kind === "column") {
        if (readOnly) return
        setActive({ kind: "column", columnId: activeData.columnId })
      }
    },
    [data, itemDrag, readOnly]
  )

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const activeData = event.active.data.current as ActiveData
      if (activeData?.kind !== "item") return
      const next = placeOver(
        data,
        { columnId: activeData.columnId, swimlaneId: activeData.swimlaneId },
        event.over?.data.current as OverData
      )
      setTarget((current) => (samePlace(current, next) ? current : next))
    },
    [data]
  )

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active: a, over } = event
      setActive(null)
      setTarget(null)
      if (!over) return

      const activeData = a.data.current as ActiveData
      const overData = over.data.current as OverData
      if (!activeData || !overData) return

      // ─── Column reorder ───
      if (activeData.kind === "column" && overData.kind === "column") {
        if (readOnly || activeData.columnId === overData.columnId) return
        const toIndex = data.columns.findIndex(
          (c) => c.id === overData.columnId
        )
        if (toIndex < 0) return
        dispatch({
          type: "reorder-column",
          columnId: activeData.columnId,
          toIndex,
        })
        return
      }

      // ─── Item move ───
      if (activeData.kind !== "item" || !itemDrag) return
      const itemId = String(a.id)
      const found = findItem(data, itemId)
      if (!found) return

      let toColumnId: string | undefined
      let toSwimlaneId: string | undefined
      let toIndex: number

      if (overData.kind === "item") {
        const overFound = findItem(data, String(over.id))
        if (!overFound) return
        toColumnId = overFound.columnId
        toSwimlaneId = overData.swimlaneId
        const targetCol = data.columns.find((c) => c.id === toColumnId)
        if (!targetCol) return
        toIndex = targetCol.items.findIndex((it) => it.id === over.id)
        if (toIndex < 0) toIndex = targetCol.items.length
      } else {
        // A cell, a collapsed column, a folded row's header, or the column's
        // empty space (`kind: "column"` reaches here only for an item drag;
        // column reorder is handled above): the item lands at the end.
        const place = placeOver(
          data,
          { columnId: found.columnId, swimlaneId: found.item.swimlaneId },
          overData
        )
        if (!place) return
        toColumnId = place.columnId
        toSwimlaneId = place.swimlaneId
        const targetCol = data.columns.find((c) => c.id === toColumnId)
        if (!targetCol) return
        toIndex = targetCol.items.length
      }

      // Envision: a target with no lane of its own keeps the item in its
      // lane. moveItem already does, but onItemMove reported `undefined`,
      // which reads as "moved out of its lane".
      if (toSwimlaneId === undefined && data.swimlanes?.length) {
        toSwimlaneId = found.item.swimlaneId
      }

      const allowed = canDrop({
        data,
        itemId,
        fromColumnId: found.columnId,
        toColumnId,
        fromSwimlaneId: found.item.swimlaneId,
        toSwimlaneId,
        readOnly: !itemDrag,
      })
      if (!allowed) return

      // For same-column moves, adjust toIndex to handle the
      // active-before-over case correctly. When the active item sits before
      // the over item in the same column, removing the active first shifts
      // the over item's index down by 1; inserting at the original over
      // index would land the active *after* over, not at over's slot.
      if (toColumnId === found.columnId && found.index < toIndex) {
        toIndex = toIndex - 1
      }

      // No-op when index doesn't actually change in the same column.
      if (
        toColumnId === found.columnId &&
        toIndex === found.index &&
        toSwimlaneId === found.item.swimlaneId
      ) {
        return
      }

      // moveItem auto-expands collapsed target columns (locked contract baked
      // into the action so both controlled and uncontrolled modes apply it
      // atomically).
      dispatch({
        type: "move-item",
        itemId,
        toColumnId,
        toIndex,
        toSwimlaneId,
      })

      // Envision: mark the item for a moment when it changed cells.
      if (
        toColumnId !== found.columnId ||
        toSwimlaneId !== found.item.swimlaneId
      ) {
        setLandedId(itemId)
        if (landedTimer.current) clearTimeout(landedTimer.current)
        landedTimer.current = setTimeout(() => setLandedId(null), LANDED_MS)
      }

      onItemMove?.(
        found.item,
        { columnId: found.columnId, swimlaneId: found.item.swimlaneId },
        { columnId: toColumnId, swimlaneId: toSwimlaneId }
      )
    },
    [data, dispatch, itemDrag, onItemMove, readOnly]
  )

  const onDragCancel = useCallback(() => {
    setActive(null)
    setTarget(null)
  }, [])

  const activeItem = active?.kind === "item" ? active.item : null
  const activeRendererId =
    active?.kind === "item" ? active.item.rendererId : undefined

  return {
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    activeItem,
    activeRendererId,
    /** Envision: the dragged item's own cell, and the one it would land in. */
    source: active?.kind === "item" ? active.from : null,
    target: active?.kind === "item" ? target : null,
    landedId,
  }
}
