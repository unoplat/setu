"use client"

import { useEffect, useRef } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ChevronDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isSwimlaneRowCollapsed } from "../lib/data"
import { samePlace, useKanbanDragState } from "../lib/drag-state"
import { findSwatch, swatchCssColor } from "../lib/palette"
import type {
  AnyKanbanCardRenderer,
  KanbanColumn,
  KanbanData,
  KanbanItem,
  KanbanPaletteSwatch,
  KanbanSwimlane,
} from "../types"
import { ItemShell } from "./item-shell"
import { makeCellId } from "./swimlane-cell"

// Envision, `layout="rows"` (Paper: 11 — Board: module rows across columns).
// The column headers sit in one line that stays at the top; under it each
// swimlane is a row across every column, with one header that stays in view
// while its row scrolls. A dragged card can cover a column of cells but never
// the name of the row it is over, which is what the sections layout got wrong.

/** How long a drag rests on a folded row's header before the row opens. */
const OPEN_ON_HOVER_MS = 500

/** The items of `column` drawn in `lane`; an unknown lane shows in the first. */
function laneItems(
  column: KanbanColumn,
  lane: KanbanSwimlane,
  swimlanes: KanbanSwimlane[]
): KanbanItem[] {
  return column.items.filter((item) => {
    const known = swimlanes.some((l) => l.id === item.swimlaneId)
    return known ? item.swimlaneId === lane.id : lane.id === swimlanes[0].id
  })
}

export function RowBoard({
  data,
  swimlanes,
  rendererMap,
  palette,
  readOnly,
  itemDrag,
  activeRendererId,
  onItemClick,
  onItemDataChange,
  onColumnAdd,
  onSwimlaneAdd,
  onToggleRow,
  className,
}: {
  data: KanbanData
  swimlanes: KanbanSwimlane[]
  rendererMap: Map<string, AnyKanbanCardRenderer>
  palette: KanbanPaletteSwatch[]
  readOnly: boolean
  itemDrag?: boolean
  activeRendererId: string | undefined
  onItemClick?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
  onColumnAdd?: (columnId: string) => void
  onSwimlaneAdd?: (swimlaneId: string) => void
  onToggleRow: (swimlaneId: string) => void
  className?: string
}) {
  const accents = new Map(
    data.columns.map((column) => [
      column.id,
      swatchCssColor(findSwatch(palette, column.color)),
    ])
  )

  return (
    // One scroller for both directions, so the pinned headers follow it. The
    // top padding belongs to the column headers: padding on the scroller
    // itself would let rows show above them as they scroll past.
    <div
      className={cn(
        "h-full min-h-0 w-full overflow-auto px-[var(--board-pad,0.75rem)] pb-[var(--board-pad,0.75rem)]",
        className
      )}
    >
      <div className="flex w-max min-w-full flex-col gap-2.5">
        <div className="sticky top-0 z-20 flex gap-3 bg-background pt-[var(--board-pad,0.75rem)] pb-2">
          {data.columns.map((column) => (
            <RowColumnHeader
              key={column.id}
              column={column}
              accent={accents.get(column.id)}
              onAdd={onColumnAdd ? () => onColumnAdd(column.id) : undefined}
            />
          ))}
        </div>

        {swimlanes.map((lane) => {
          const collapsed = isSwimlaneRowCollapsed(data.columns, lane.id)
          const cells = data.columns.map((column) => ({
            column,
            items: laneItems(column, lane, swimlanes),
          }))
          const count = cells.reduce((sum, cell) => sum + cell.items.length, 0)
          return (
            <section
              key={lane.id}
              aria-label={lane.title}
              className="flex flex-col gap-2"
            >
              <RowHeader
                lane={lane}
                count={count}
                collapsed={collapsed}
                onToggle={() => onToggleRow(lane.id)}
                onAdd={onSwimlaneAdd ? () => onSwimlaneAdd(lane.id) : undefined}
              />
              {collapsed ? null : (
                <div className="flex items-stretch gap-3">
                  {cells.map(({ column, items }) => (
                    <RowCell
                      key={column.id}
                      column={column}
                      lane={lane}
                      items={items}
                      accent={accents.get(column.id)}
                      rendererMap={rendererMap}
                      readOnly={readOnly}
                      itemDrag={itemDrag}
                      rejectDrop={
                        activeRendererId !== undefined &&
                        column.acceptsRendererIds !== undefined &&
                        !column.acceptsRendererIds.includes(activeRendererId)
                      }
                      onItemClick={onItemClick}
                      onItemDataChange={readOnly ? undefined : onItemDataChange}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function RowColumnHeader({
  column,
  accent,
  onAdd,
}: {
  column: KanbanColumn
  accent: string | undefined
  onAdd?: () => void
}) {
  return (
    <div
      className="flex h-10 w-80 shrink-0 items-center gap-2 rounded-md border-y border-s-4 border-e border-border bg-card/40 ps-2.5 pe-1.5"
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={accent ? { backgroundColor: accent } : undefined}
      />
      <span className="truncate text-sm font-medium text-foreground">
        {column.title}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {column.items.length}
      </span>
      <span className="flex-1" />
      {onAdd ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onAdd}
          aria-label={`Add to ${column.title}`}
        >
          <Plus className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

function RowHeader({
  lane,
  count,
  collapsed,
  onToggle,
  onAdd,
}: {
  lane: KanbanSwimlane
  count: number
  collapsed: boolean
  onToggle: () => void
  onAdd?: () => void
}) {
  const { source, target } = useKanbanDragState()
  // Only a folded row's header takes drops: an open row has its cells. The
  // card keeps its column and moves to this row.
  const { setNodeRef, isOver } = useDroppable({
    id: `row::${lane.id}`,
    data: { kind: "row", swimlaneId: lane.id },
    disabled: !collapsed,
  })
  const opening = collapsed && isOver

  // Resting on a folded row opens it, so the card can go to any of its cells.
  const toggle = useRef(onToggle)
  useEffect(() => {
    toggle.current = onToggle
  })
  useEffect(() => {
    if (!opening) return
    const timer = setTimeout(() => toggle.current(), OPEN_ON_HOVER_MS)
    return () => clearTimeout(timer)
  }, [opening])

  // The row the card would land in, unless it is already in it.
  const landing =
    target !== null &&
    target.swimlaneId === lane.id &&
    source?.swimlaneId !== lane.id

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Below the column headers: their top padding, height and gap.
        "sticky top-[calc(var(--board-pad,0.75rem)+3rem)] z-10 flex h-7 items-center gap-2 rounded-sm bg-background transition-colors",
        opening && "bg-sidebar-primary/10 ring-1 ring-sidebar-primary/50"
      )}
    >
      {/* Stays at the left edge when the board is scrolled sideways. */}
      <div className="sticky left-[var(--board-pad,0.75rem)] flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-6 gap-1.5 rounded-sm px-1.5 text-[11px] leading-3.5 font-semibold tracking-[0.08em] text-foreground uppercase",
            (landing || opening) && "text-sidebar-primary"
          )}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${lane.title}`}
        >
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground transition-transform",
              collapsed && "-rotate-90",
              (landing || opening) && "text-sidebar-primary"
            )}
          />
          <span className="truncate">{lane.title}</span>
        </Button>
        <span className="text-[11px] leading-3.5 text-muted-foreground tabular-nums">
          {count}
        </span>
        {opening ? (
          <span className="text-[11px] leading-3.5 font-medium text-sidebar-primary">
            Opening…
          </span>
        ) : null}
      </div>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      {onAdd ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          onClick={onAdd}
          aria-label={`Add to ${lane.title}`}
        >
          <Plus className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

function RowCell({
  column,
  lane,
  items,
  accent,
  rendererMap,
  readOnly,
  itemDrag,
  rejectDrop,
  onItemClick,
  onItemDataChange,
}: {
  column: KanbanColumn
  lane: KanbanSwimlane
  items: KanbanItem[]
  accent: string | undefined
  rendererMap: Map<string, AnyKanbanCardRenderer>
  readOnly: boolean
  itemDrag?: boolean
  rejectDrop: boolean
  onItemClick?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
}) {
  const cellId = makeCellId(column.id, lane.id)
  const { setNodeRef } = useDroppable({
    id: cellId,
    data: { kind: "cell", columnId: column.id, swimlaneId: lane.id },
  })
  const { source, target, dropLandsFirst } = useKanbanDragState()
  const place = { columnId: column.id, swimlaneId: lane.id }
  // Lit only when the card would change cells; over its own cell nothing moves.
  const landing = samePlace(target, place) && !samePlace(source, place)

  return (
    <SortableContext
      id={cellId}
      items={items.map((item) => item.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        data-cell-id={cellId}
        role="group"
        aria-label={`${column.title}, ${lane.title}`}
        className={cn(
          "flex min-h-16 w-80 shrink-0 flex-col gap-2 rounded-md border-y border-s-4 border-e border-border bg-card/40 p-1.5 transition-colors",
          landing &&
            !rejectDrop &&
            "bg-sidebar-primary/10 ring-1 ring-sidebar-primary/50 ring-inset",
          landing &&
            rejectDrop &&
            "bg-destructive/10 ring-1 ring-destructive/40 ring-inset"
        )}
        style={accent ? { borderLeftColor: accent } : undefined}
      >
        {landing && !rejectDrop && dropLandsFirst ? <DropLine /> : null}
        {items.map((item) => (
          <ItemShell
            key={item.id}
            item={item}
            columnId={column.id}
            swimlaneId={lane.id}
            rendererMap={rendererMap}
            rendererLabel={rendererMap.get(item.rendererId)?.label ?? "Item"}
            readOnly={readOnly}
            itemDrag={itemDrag}
            onClick={onItemClick}
            onItemDataChange={onItemDataChange}
          />
        ))}
      </div>
    </SortableContext>
  )
}

/** Where the card will sit: a line with a ring at its start. */
function DropLine() {
  return (
    <div aria-hidden="true" className="flex h-2 items-center">
      <span className="size-2 shrink-0 rounded-full border-2 border-sidebar-primary" />
      <span className="h-0.5 flex-1 rounded-full bg-sidebar-primary" />
    </div>
  )
}
