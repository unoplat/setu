import { createContext, useContext } from "react"

/** A cell of the board: a column and, with swimlanes, one of its lanes. */
export type KanbanPlace = { columnId: string; swimlaneId?: string }

/**
 * Envision: what the board knows about the drag in progress, for the parts
 * that draw it. `isOver` on a droppable is true only for the innermost one
 * under the pointer (a card, not its cell), so the cell being dropped into is
 * worked out once, in useDragHandlers, and read from here.
 */
export type KanbanDragState = {
  /** Where the dragged item came from; null when nothing is dragged. */
  source: KanbanPlace | null
  /** Where it would land if released now. */
  target: KanbanPlace | null
  /** The item that was just moved, for a moment after it lands. */
  landedId: string | null
  dropLandsFirst: boolean
}

export const IDLE_DRAG_STATE: KanbanDragState = {
  source: null,
  target: null,
  landedId: null,
  dropLandsFirst: false,
}

export const KanbanDragStateContext =
  createContext<KanbanDragState>(IDLE_DRAG_STATE)

export function useKanbanDragState(): KanbanDragState {
  return useContext(KanbanDragStateContext)
}

export function samePlace(
  a: KanbanPlace | null,
  b: KanbanPlace | null
): boolean {
  if (a === null || b === null) return a === b
  return a.columnId === b.columnId && a.swimlaneId === b.swimlaneId
}
