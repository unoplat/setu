"use client"

import { useEffect, useMemo } from "react"
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { cn } from "@/lib/utils"
import { Board } from "./parts/board"
import { KanbanDragOverlay } from "./parts/drag-overlay"
import { RowBoard } from "./parts/row-board"
import { useDragHandlers } from "./hooks/use-drag-handlers"
import { useKanbanState } from "./hooks/use-kanban-state"
import { useRendererMap } from "./hooks/use-renderer-map"
import { newColumnId, newItemId } from "./lib/ids"
import { DEFAULT_PALETTE } from "./lib/palette"
import { validateData } from "./lib/data"
import {
  KanbanDragStateContext,
  samePlace,
  type KanbanPlace,
} from "./lib/drag-state"
import type {
  AnyKanbanCardRenderer,
  KanbanBoardProps,
  KanbanColumn,
  KanbanItem,
} from "./types"

// Pointer-based collision detection so an item drops wherever the cursor is —
// onto a card (reorder) or anywhere in a column's empty space / the column
// wrapper (append to end), not only when a droppable's *center* is nearest.
// Column reorder branches to center-of-columns-only so a card inside the target
// column can't swallow the column drop. `rectIntersection` is a fling fallback
// when the pointer isn't within any droppable.
const kanbanCollisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.kind === "column") {
    const columnsOnly = args.droppableContainers.filter(
      (c) => c.data.current?.kind === "column"
    )
    return closestCenter({ ...args, droppableContainers: columnsOnly })
  }
  const pointer = pointerWithin(args)
  return pointer.length > 0 ? pointer : rectIntersection(args)
}

// Envision: a folded row that opens under a drag pushes the rows below it
// down, so droppables are measured throughout the drag, not once at its start.
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }

export function KanbanBoard({
  renderers,
  data,
  defaultData,
  onChange,
  onItemCreate,
  onItemUpdate,
  onItemDelete,
  onColumnCreate,
  onColumnUpdate,
  onColumnDelete,
  onColumnAdd,
  renderSwimlaneHeader,
  hideEmptyPlaceholder,
  layout = "sections",
  onSwimlaneAdd,
  renderDragPreview,
  dropLandsFirst = false,
  onItemClick,
  onItemMove,
  palette,
  readOnly = false,
  allowItemDrag = false,
  "aria-label": ariaLabel = "Kanban board",
  className,
}: KanbanBoardProps) {
  const [state, dispatch] = useKanbanState({ data, defaultData, onChange })
  const rendererMap = useRendererMap(renderers)
  const palettePinned = useMemo(() => palette ?? DEFAULT_PALETTE, [palette])
  // Envision: items can be dragged on a read-only board that allows it.
  const itemDrag = !readOnly || allowItemDrag

  // Internal drag handlers + create-handler still use positional shapes for
  // their internal contract. Adapt the public object-shape callbacks at this
  // boundary so dispatch / useDragHandlers / handleItemCreate stay untouched.
  const handlePartItemMove = onItemMove
    ? (
        item: KanbanItem,
        from: { columnId: string; swimlaneId?: string },
        to: { columnId: string; swimlaneId?: string }
      ) => onItemMove({ item, from, to })
    : undefined

  // Mount-time validation (developer feedback only; doesn't block render).
  useEffect(() => {
    if (renderers.length === 0) {
      console.error(
        "[kanban-board] `renderers` prop is required and must contain at least one entry."
      )
      return
    }
    const result = validateData(state, renderers)
    if (!result.valid) {
      for (const err of result.errors) {
        console.warn(`[kanban-board] ${err}`)
      }
    }
    // Re-validate when renderers OR data change, so duplicate-id / unknown-renderer
    // problems introduced by later (controlled) `data` updates are still surfaced.
  }, [renderers, state])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const {
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    activeItem,
    activeRendererId,
    source,
    target,
    landedId,
  } = useDragHandlers({
    data: state,
    readOnly,
    itemDrag,
    dispatch,
    onItemMove: handlePartItemMove,
  })

  // Envision: what the parts draw the drag from, the words that name a cell
  // ("Blocked · Payments"), and the same words for screen readers.
  const dragState = useMemo(
    () => ({ source, target, landedId, dropLandsFirst }),
    [source, target, landedId, dropLandsFirst]
  )
  const placeLabel = (place: KanbanPlace) =>
    [
      state.columns.find((c) => c.id === place.columnId)?.title,
      state.swimlanes?.find((l) => l.id === place.swimlaneId)?.title,
    ]
      .filter(Boolean)
      .join(" · ")
  const destination =
    target && !samePlace(source, target) ? placeLabel(target) : undefined
  // Read from the event, not from `target`: state is one event behind here.
  const announcedPlace = (
    active: { data: { current?: unknown } },
    over: { data: { current?: unknown } } | null
  ) => {
    const from = active.data.current as
      | (KanbanPlace & { kind?: string })
      | undefined
    const onto = over?.data.current as Partial<KanbanPlace> | undefined
    if (from?.kind !== "item" || !onto) return null
    const to = {
      columnId: onto.columnId ?? from.columnId,
      swimlaneId: onto.swimlaneId ?? from.swimlaneId,
    }
    return { label: placeLabel(to), moved: !samePlace(from, to) }
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const from = active.data.current as
        | (KanbanPlace & { kind?: string })
        | undefined
      return from?.kind === "item"
        ? `Picked up an item in ${placeLabel(from)}.`
        : undefined
    },
    onDragOver: ({ active, over }) => {
      const place = announcedPlace(active, over)
      return place ? `Over ${place.label}.` : undefined
    },
    onDragEnd: ({ active, over }) => {
      const place = announcedPlace(active, over)
      if (!place) return "Dropped where it was."
      return place.moved ? `Moved to ${place.label}.` : "Dropped where it was."
    },
    onDragCancel: () => "Move cancelled.",
  }

  const rows = layout === "rows" && state.swimlanes?.length
  function handleToggleRow(swimlaneId: string) {
    dispatch({ type: "toggle-swimlane-row", swimlaneId })
  }

  // Internal handlers translating UI events into reducer actions + consumer callbacks.
  function handleItemCreate(columnId: string, item: KanbanItem) {
    dispatch({ type: "create-item", columnId, item })
    onItemCreate?.({ columnId, item })
  }

  function handleItemUpdate(item: KanbanItem) {
    dispatch({ type: "update-item", item })
    onItemUpdate?.(item)
  }

  function handleItemDelete(itemId: string) {
    dispatch({ type: "delete-item", itemId })
    onItemDelete?.(itemId)
  }

  function handleColumnCreate(column: KanbanColumn) {
    dispatch({ type: "create-column", column })
    onColumnCreate?.(column)
  }

  function handleColumnUpdate(column: KanbanColumn) {
    dispatch({ type: "update-column", column })
    onColumnUpdate?.(column)
  }

  function handleColumnDelete(columnId: string) {
    dispatch({ type: "delete-column", columnId })
    onColumnDelete?.(columnId)
  }

  function handleSetColor(columnId: string, color: string | undefined) {
    dispatch({ type: "set-color", columnId, color })
  }

  function handleToggleCollapse(columnId: string) {
    dispatch({ type: "toggle-collapse", columnId })
  }

  // Envision: collapse one section of one column.
  function handleToggleSwimlaneCollapse(columnId: string, swimlaneId: string) {
    dispatch({ type: "toggle-swimlane-collapse", columnId, swimlaneId })
  }

  if (renderers.length === 0) {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        className={cn(
          "flex h-full min-h-32 items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive",
          className
        )}
      >
        kanban-board requires at least one renderer
      </div>
    )
  }

  // When nothing can be dragged, skip DnD wiring entirely.
  if (!itemDrag) {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        className={cn("relative flex h-full min-h-0 flex-col", className)}
      >
        {rows && state.swimlanes ? (
          <RowBoard
            data={state}
            swimlanes={state.swimlanes}
            rendererMap={rendererMap}
            palette={palettePinned}
            readOnly
            activeRendererId={undefined}
            onItemClick={onItemClick}
            onColumnAdd={onColumnAdd}
            onSwimlaneAdd={onSwimlaneAdd}
            onToggleRow={handleToggleRow}
          />
        ) : (
          <Board
            data={state}
            swimlanes={state.swimlanes}
            rendererMap={rendererMap}
            renderers={renderers}
            palette={palettePinned}
            readOnly
            activeRendererId={undefined}
            onItemClick={onItemClick}
            onColumnAdd={onColumnAdd}
            renderSwimlaneHeader={renderSwimlaneHeader}
            hideEmptyPlaceholder={hideEmptyPlaceholder}
            onToggleSwimlaneCollapse={handleToggleSwimlaneCollapse}
            onSetColor={handleSetColor}
            onToggleCollapse={handleToggleCollapse}
          />
        )}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={kanbanCollisionDetection}
      measuring={MEASURING}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <KanbanDragStateContext.Provider value={dragState}>
        <div
          role="region"
          aria-label={ariaLabel}
          className={cn("relative flex h-full min-h-0 flex-col", className)}
        >
          {rows && state.swimlanes ? (
            <RowBoard
              data={state}
              swimlanes={state.swimlanes}
              rendererMap={rendererMap}
              palette={palettePinned}
              readOnly={readOnly}
              itemDrag
              activeRendererId={activeRendererId}
              onItemClick={onItemClick}
              onItemDataChange={handleItemUpdate}
              onColumnAdd={onColumnAdd}
              onSwimlaneAdd={onSwimlaneAdd}
              onToggleRow={handleToggleRow}
            />
          ) : (
            <Board
              data={state}
              swimlanes={state.swimlanes}
              rendererMap={rendererMap}
              renderers={renderers}
              palette={palettePinned}
              readOnly={readOnly}
              itemDrag
              activeRendererId={activeRendererId}
              onItemCreate={onItemCreate ? handleItemCreate : undefined}
              onItemUpdate={onItemUpdate ? handleItemUpdate : undefined}
              onItemDelete={onItemDelete ? handleItemDelete : undefined}
              onItemClick={onItemClick}
              // Ungated: a self-editing renderer (e.g. the card-tree adapter) must persist
              // its in-place edits to board state even when the consumer wires no onItemUpdate.
              onItemDataChange={handleItemUpdate}
              onColumnCreate={onColumnCreate ? handleColumnCreate : undefined}
              onColumnUpdate={onColumnUpdate ? handleColumnUpdate : undefined}
              onColumnDelete={onColumnDelete ? handleColumnDelete : undefined}
              onColumnAdd={onColumnAdd}
              renderSwimlaneHeader={renderSwimlaneHeader}
              hideEmptyPlaceholder={hideEmptyPlaceholder}
              onToggleSwimlaneCollapse={handleToggleSwimlaneCollapse}
              onSetColor={handleSetColor}
              onToggleCollapse={handleToggleCollapse}
            />
          )}
        </div>
      </KanbanDragStateContext.Provider>
      <KanbanDragOverlay
        activeItem={activeItem}
        rendererMap={rendererMap}
        renderPreview={renderDragPreview}
        destination={destination}
      />
    </DndContext>
  )
}

// Public helper exported for advanced consumers writing custom inline editors.
export function findRenderer(
  renderers: AnyKanbanCardRenderer[],
  rendererId: string
): AnyKanbanCardRenderer | undefined {
  return renderers.find((r) => r.id === rendererId)
}

// Re-export ID helpers for consumers building items / columns programmatically.
export { newItemId, newColumnId }
