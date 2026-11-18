"use client"

import { useRef, useState } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ChevronDown, CircleDashed, Plus } from "lucide-react"
import { StatusDot } from "@/components/app-ui/status-dot"
import { cn } from "@/lib/utils"
import { isSwimlaneRowCollapsed } from "../lib/data"
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
import { laneItems } from "./row-board"
import { makeCellId } from "./swimlane-cell"

// Envision, `layout="rows"` on a phone (Paper: Kanban · 1 Board default).
// One Status column fills the screen at a time. A row of Status chips names
// it: each chip has an underline as wide as itself, lit under the column in
// view. The columns sit side by side on a track that snaps by column, and
// swiping the track or tapping a chip keeps the two in step. In a column each
// swimlane (Module) is a section whose header stays in view while its cards
// scroll. Swimlanes with nothing in the
// column fold into one muted line; tapping it shows them, so a Task can still
// be added there. Nothing shows a count (PRODUCT.md). The round "+" adds a
// Task to the column in view; columns that take none (Cancelled) hide it.

/** The track's side padding, which each column snaps to (px-4). */
const TRACK_PAD = 16

export function MobileRowBoard({
  data,
  swimlanes,
  rendererMap,
  palette,
  readOnly,
  itemDrag,
  onItemClick,
  onItemDataChange,
  onColumnAdd,
  onSwimlaneAdd,
  onToggleRow,
  className,
}: {
  data: KanbanData
  /** Empty or undefined: the Board has no Modules, and each column is one list. */
  swimlanes: KanbanSwimlane[] | undefined
  rendererMap: Map<string, AnyKanbanCardRenderer>
  palette: KanbanPaletteSwatch[]
  readOnly: boolean
  itemDrag?: boolean
  onItemClick?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
  /** The round "+": adds to the column in view. */
  onColumnAdd?: (columnId: string) => void
  onSwimlaneAdd?: (swimlaneId: string, columnId?: string) => void
  onToggleRow: (swimlaneId: string) => void
  className?: string
}) {
  const track = useRef<HTMLDivElement>(null)
  const chips = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const lanes = swimlanes?.length ? swimlanes : undefined
  const current = data.columns[Math.min(active, data.columns.length - 1)]
  const canAddHere =
    onColumnAdd !== undefined && current && current.allowAdd !== false

  function showChip(index: number) {
    const chip = chips.current?.children[index] as HTMLElement | undefined
    chip?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  // The column whose start is nearest the track's left edge is the one in view.
  function handleScroll() {
    const el = track.current
    if (!el) return
    let nearest = 0
    let best = Infinity
    Array.from(el.children).forEach((child, index) => {
      const distance = Math.abs(
        (child as HTMLElement).offsetLeft - TRACK_PAD - el.scrollLeft
      )
      if (distance < best) {
        best = distance
        nearest = index
      }
    })
    if (nearest !== active) {
      setActive(nearest)
      showChip(nearest)
    }
  }

  function goTo(index: number) {
    const column = track.current?.children[index] as HTMLElement | undefined
    if (!column || !track.current) return
    track.current.scrollTo({
      left: column.offsetLeft - TRACK_PAD,
      behavior: "smooth",
    })
    setActive(index)
    showChip(index)
  }

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      {/* Each chip has its own underline, as wide as the chip; the one in
          view is lit (Paper: Kanban 1–4, "Status chip · …" › Underline). */}
      <div className="relative shrink-0 border-b border-border bg-background">
        <div
          ref={chips}
          role="tablist"
          aria-label="Status"
          className="flex [scrollbar-width:none] items-start gap-0.5 overflow-x-auto px-4 pt-0.75 pb-1.25 [&::-webkit-scrollbar]:hidden"
        >
          {data.columns.map((column, index) => {
            const selected = index === active
            const accent = swatchCssColor(findSwatch(palette, column.color))
            return (
              <button
                key={column.id}
                type="button"
                role="tab"
                id={`status-tab-${column.id}`}
                aria-selected={selected}
                aria-controls={`status-column-${column.id}`}
                onClick={() => goTo(index)}
                className="flex shrink-0 flex-col gap-0.75 outline-none focus-visible:[&>span:first-child]:ring-[3px] focus-visible:[&>span:first-child]:ring-ring/50"
              >
                <span
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full px-3 text-sm",
                    selected
                      ? "bg-muted font-semibold text-foreground"
                      : "font-medium text-muted-foreground"
                  )}
                >
                  <StatusDot
                    color={accent}
                    hollow={column.allowAdd === false}
                  />
                  {column.title}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-0.5 w-full rounded-full",
                    selected ? "bg-sidebar-primary" : "bg-muted"
                  )}
                />
              </button>
            )
          })}
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-linear-to-r from-transparent to-background"
        />
      </div>

      <div
        ref={track}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-4 overflow-x-auto overscroll-x-contain px-4 [&::-webkit-scrollbar]:hidden"
      >
        {data.columns.map((column) => (
          <MobileColumn
            key={column.id}
            column={column}
            columns={data.columns}
            swimlanes={lanes}
            rendererMap={rendererMap}
            readOnly={readOnly}
            itemDrag={itemDrag}
            roomForFab={onColumnAdd !== undefined}
            onItemClick={onItemClick}
            onItemDataChange={readOnly ? undefined : onItemDataChange}
            onSwimlaneAdd={onSwimlaneAdd}
            onToggleRow={onToggleRow}
          />
        ))}
      </div>

      {canAddHere ? (
        <button
          type="button"
          onClick={() => onColumnAdd(current.id)}
          aria-label={`New task in ${current.title}`}
          className="absolute end-4 bottom-4 z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_#00000073,0_2px_6px_#0000004d] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95"
        >
          <Plus className="size-6" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  )
}

function MobileColumn({
  column,
  columns,
  swimlanes,
  rendererMap,
  readOnly,
  itemDrag,
  roomForFab,
  onItemClick,
  onItemDataChange,
  onSwimlaneAdd,
  onToggleRow,
}: {
  column: KanbanColumn
  columns: KanbanColumn[]
  swimlanes: KanbanSwimlane[] | undefined
  rendererMap: Map<string, AnyKanbanCardRenderer>
  readOnly: boolean
  itemDrag?: boolean
  roomForFab: boolean
  onItemClick?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
  onSwimlaneAdd?: (swimlaneId: string, columnId?: string) => void
  onToggleRow: (swimlaneId: string) => void
}) {
  const [showEmpty, setShowEmpty] = useState(false)
  const lanes = (swimlanes ?? []).map((lane) => ({
    lane,
    items: laneItems(column, lane, swimlanes ?? []),
  }))
  const filled = lanes.filter((l) => l.items.length > 0)
  const empty = lanes.filter((l) => l.items.length === 0)
  // A column that takes no new Tasks (Cancelled) has no "+" anywhere.
  const canAdd = column.allowAdd !== false && onSwimlaneAdd !== undefined
  const renderLane = ({ lane, items }: (typeof lanes)[number]) => (
    <MobileSection
      key={lane.id}
      column={column}
      lane={lane}
      items={items}
      collapsed={isSwimlaneRowCollapsed(columns, lane.id)}
      rendererMap={rendererMap}
      readOnly={readOnly}
      itemDrag={itemDrag}
      onItemClick={onItemClick}
      onItemDataChange={onItemDataChange}
      onAdd={canAdd ? () => onSwimlaneAdd(lane.id, column.id) : undefined}
      onToggle={() => onToggleRow(lane.id)}
    />
  )

  return (
    <section
      id={`status-column-${column.id}`}
      role="tabpanel"
      aria-labelledby={`status-tab-${column.id}`}
      className={cn(
        "flex h-full w-[calc(100vw-2rem)] shrink-0 snap-start [scrollbar-width:none] flex-col overflow-y-auto overscroll-y-contain [&::-webkit-scrollbar]:hidden",
        roomForFab ? "pb-24" : "pb-4"
      )}
    >
      {!swimlanes ? (
        <MobileList
          column={column}
          items={column.items}
          rendererMap={rendererMap}
          readOnly={readOnly}
          itemDrag={itemDrag}
          onItemClick={onItemClick}
          onItemDataChange={onItemDataChange}
          className="pt-3"
        />
      ) : null}

      {empty.length > 0 ? (
        <div className={cn(showEmpty && "border-b border-border")}>
          <button
            type="button"
            className={cn(
              "flex h-11 w-full shrink-0 items-center gap-2 text-start text-compact text-muted-foreground",
              !showEmpty && "border-b border-border"
            )}
            aria-expanded={showEmpty}
            onClick={() => setShowEmpty((open) => !open)}
          >
            <CircleDashed
              className="size-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">
              {empty.map((l) => l.lane.title).join(", ")} — nothing in{" "}
              {column.title}
            </span>
            <ChevronDown
              aria-hidden="true"
              strokeWidth={1.75}
              className={cn(
                "size-4 shrink-0 transition-transform",
                showEmpty && "rotate-180"
              )}
            />
          </button>
          {showEmpty ? (
            <div className="flex flex-col pb-2">{empty.map(renderLane)}</div>
          ) : null}
        </div>
      ) : null}

      {filled.map(renderLane)}

      {!swimlanes && column.items.length === 0 ? (
        <p className="py-6 text-center text-compact text-muted-foreground">
          Nothing in {column.title}
        </p>
      ) : null}
    </section>
  )
}

function MobileSection({
  column,
  lane,
  items,
  collapsed,
  rendererMap,
  readOnly,
  itemDrag,
  onItemClick,
  onItemDataChange,
  onAdd,
  onToggle,
}: {
  column: KanbanColumn
  lane: KanbanSwimlane
  items: KanbanItem[]
  collapsed: boolean
  rendererMap: Map<string, AnyKanbanCardRenderer>
  readOnly: boolean
  itemDrag?: boolean
  onItemClick?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
  onAdd?: () => void
  onToggle: () => void
}) {
  return (
    <section aria-label={lane.title} className="flex flex-col">
      <div className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2 bg-background">
        <button
          type="button"
          className="flex h-11 min-w-0 flex-1 items-center gap-2 text-start text-xs font-semibold tracking-[0.06em] text-foreground uppercase"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${lane.title}`}
        >
          <ChevronDown
            aria-hidden="true"
            strokeWidth={1.75}
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              collapsed && "-rotate-90"
            )}
          />
          <span className="truncate">{lane.title}</span>
        </button>
        {onAdd ? (
          <button
            type="button"
            className="-me-3 flex size-11 shrink-0 items-center justify-center text-muted-foreground"
            onClick={onAdd}
            aria-label={`Add to ${lane.title}`}
          >
            <Plus className="size-4.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {collapsed ? null : (
        <MobileList
          column={column}
          lane={lane}
          items={items}
          rendererMap={rendererMap}
          readOnly={readOnly}
          itemDrag={itemDrag}
          onItemClick={onItemClick}
          onItemDataChange={onItemDataChange}
        />
      )}
    </section>
  )
}

/** The cards of one column, or of one section of it, as a drop target. */
function MobileList({
  column,
  lane,
  items,
  rendererMap,
  readOnly,
  itemDrag,
  onItemClick,
  onItemDataChange,
  className,
}: {
  column: KanbanColumn
  lane?: KanbanSwimlane
  items: KanbanItem[]
  rendererMap: Map<string, AnyKanbanCardRenderer>
  readOnly: boolean
  itemDrag?: boolean
  onItemClick?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
  className?: string
}) {
  const cellId = makeCellId(column.id, lane?.id)
  const { setNodeRef } = useDroppable({
    id: cellId,
    data: { kind: "cell", columnId: column.id, swimlaneId: lane?.id },
  })

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
        aria-label={lane ? `${column.title}, ${lane.title}` : column.title}
        className={cn(
          "flex flex-col gap-2",
          items.length > 0 && "pb-4",
          className
        )}
      >
        {items.map((item) => (
          <ItemShell
            key={item.id}
            item={item}
            columnId={column.id}
            swimlaneId={lane?.id}
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
