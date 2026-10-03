"use client"

import type { ReactNode } from "react"
import { useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import type {
  AnyKanbanCardRenderer,
  KanbanColumn,
  KanbanItem,
  KanbanSwimlane,
  KanbanSwimlaneHeaderContext,
} from "../types"
import { SwimlaneCell, makeCellId } from "./swimlane-cell"

export function ColumnBody({
  column,
  swimlanes,
  rendererMap,
  readOnly,
  itemDrag,
  activeRendererId,
  renderSwimlaneHeader,
  hideEmptyPlaceholder,
  onToggleSwimlaneCollapse,
  onItemClick,
  onItemDelete,
  onItemEdit,
  onItemDataChange,
}: {
  column: KanbanColumn
  swimlanes: KanbanSwimlane[] | undefined
  rendererMap: Map<string, AnyKanbanCardRenderer>
  readOnly: boolean
  /** Envision: items can be dragged; defaults to `!readOnly`. */
  itemDrag?: boolean
  activeRendererId: string | undefined
  // Envision: custom section header, collapse, and no "Empty" box.
  renderSwimlaneHeader?: (ctx: KanbanSwimlaneHeaderContext) => ReactNode
  hideEmptyPlaceholder?: boolean
  onToggleSwimlaneCollapse?: (swimlaneId: string) => void
  onItemClick?: (item: KanbanItem) => void
  onItemDelete?: (itemId: string) => void
  onItemEdit?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
}) {
  // A drop is rejected if there's an active drag and this column doesn't accept that renderer.
  const rejectDrop =
    activeRendererId !== undefined &&
    column.acceptsRendererIds !== undefined &&
    !column.acceptsRendererIds.includes(activeRendererId)

  const hasSwimlanes = !!(swimlanes && swimlanes.length > 0)
  const lanes: (KanbanSwimlane | undefined)[] =
    swimlanes && swimlanes.length > 0 ? swimlanes : [undefined]

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5">
      {/* In single-lane mode the lone cell grows to fill the column so the whole
          empty area below the cards is a (highlighted) drop target. In swimlane
          mode each lane cell stays content-sized so the lanes stack + scroll. */}
      <div
        className={cn(
          "flex flex-col gap-2 py-1.5",
          !hasSwimlanes && "min-h-full"
        )}
      >
        {lanes.map((lane) => {
          const items = column.items.filter((it) => {
            if (!swimlanes || swimlanes.length === 0) return true
            // If item's swimlaneId is missing or unknown, it lands in the first lane.
            const known = swimlanes.some((l) => l.id === it.swimlaneId)
            if (!known) return lane?.id === swimlanes[0].id
            return it.swimlaneId === lane?.id
          })
          const collapsed = lane
            ? (column.collapsedSwimlanes?.includes(lane.id) ?? false)
            : false
          return (
            <div
              key={lane?.id ?? "_"}
              className={cn("flex flex-col gap-1", !hasSwimlanes && "flex-1")}
            >
              {lane ? (
                <SectionHeaderDrop
                  columnId={column.id}
                  swimlaneId={lane.id}
                  rejectDrop={rejectDrop}
                >
                  {renderSwimlaneHeader ? (
                    renderSwimlaneHeader({
                      column,
                      swimlane: lane,
                      collapsed,
                      itemCount: items.length,
                      readOnly,
                      onToggleCollapse: () =>
                        onToggleSwimlaneCollapse?.(lane.id),
                    })
                  ) : (
                    <span className="px-1 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                      {lane.title}
                    </span>
                  )}
                </SectionHeaderDrop>
              ) : null}
              {/* Envision: a collapsed section shows its header only. */}
              {collapsed ? null : (
                <SwimlaneCell
                  column={column}
                  swimlaneId={lane?.id}
                  items={items}
                  rendererMap={rendererMap}
                  readOnly={readOnly}
                  itemDrag={itemDrag}
                  rejectDrop={rejectDrop}
                  grow={!hasSwimlanes}
                  hideEmptyPlaceholder={hideEmptyPlaceholder}
                  onItemClick={onItemClick}
                  onItemDelete={onItemDelete}
                  onItemEdit={onItemEdit}
                  onItemDataChange={onItemDataChange}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Envision: a section's header takes drops into its section. A collapsed
 * section, and an empty one (collapsed by default), shows only its header, so
 * without this a card could not be moved into it.
 */
function SectionHeaderDrop({
  columnId,
  swimlaneId,
  rejectDrop,
  children,
}: {
  columnId: string
  swimlaneId: string
  rejectDrop: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${makeCellId(columnId, swimlaneId)}::header`,
    data: { kind: "cell", columnId, swimlaneId },
  })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-sm transition-colors",
        isOver && !rejectDrop && "bg-accent/40 ring-1 ring-ring/30",
        isOver && rejectDrop && "bg-destructive/10 ring-1 ring-destructive/40"
      )}
    >
      {children}
    </div>
  )
}
