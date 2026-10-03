"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { cn } from "@/lib/utils"
import type { AnyKanbanCardRenderer, KanbanColumn, KanbanItem } from "../types"
import { ItemShell } from "./item-shell"

export function makeCellId(
  columnId: string,
  swimlaneId: string | undefined
): string {
  return `${columnId}::${swimlaneId ?? "_"}`
}

export function SwimlaneCell({
  column,
  swimlaneId,
  items,
  rendererMap,
  readOnly,
  itemDrag,
  rejectDrop,
  grow,
  hideEmptyPlaceholder,
  onItemClick,
  onItemDelete,
  onItemEdit,
  onItemDataChange,
}: {
  column: KanbanColumn
  swimlaneId: string | undefined
  items: KanbanItem[]
  rendererMap: Map<string, AnyKanbanCardRenderer>
  readOnly: boolean
  /** Envision: items can be dragged; defaults to `!readOnly`. */
  itemDrag?: boolean
  rejectDrop: boolean
  /** Fill the available column height so the whole empty area is a drop target (single-lane mode). */
  grow?: boolean
  /** Envision: omit the dashed "Empty" box. */
  hideEmptyPlaceholder?: boolean
  onItemClick?: (item: KanbanItem) => void
  onItemDelete?: (itemId: string) => void
  onItemEdit?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
}) {
  // Envision: with no placeholder on a read-only board an empty cell reserves
  // no height (an open empty section is just its header, which takes drops).
  const collapseWhenEmpty =
    !!hideEmptyPlaceholder && readOnly && items.length === 0
  const cellId = makeCellId(column.id, swimlaneId)
  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    data: { kind: "cell", columnId: column.id, swimlaneId },
  })

  return (
    <SortableContext
      id={cellId}
      items={items.map((it) => it.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        data-cell-id={cellId}
        className={cn(
          "flex min-h-12 flex-col gap-2 rounded-sm p-1.5 transition-colors",
          collapseWhenEmpty && "min-h-0 p-0", // Envision (cn = tailwind-merge, later wins)
          grow && "flex-1",
          isOver && !rejectDrop && "bg-accent/40 ring-1 ring-ring/30",
          isOver && rejectDrop && "bg-destructive/10 ring-1 ring-destructive/40"
        )}
      >
        {items.map((item) => {
          const renderer = rendererMap.get(item.rendererId)
          const label = renderer?.label ?? "Item"
          return (
            <ItemShell
              key={item.id}
              item={item}
              columnId={column.id}
              swimlaneId={swimlaneId}
              rendererMap={rendererMap}
              rendererLabel={label}
              readOnly={readOnly}
              itemDrag={itemDrag}
              onClick={onItemClick}
              onDelete={onItemDelete}
              onEdit={onItemEdit}
              onItemDataChange={onItemDataChange}
            />
          )
        })}
        {items.length === 0 && !hideEmptyPlaceholder ? (
          <div className="pointer-events-none flex h-12 items-center justify-center rounded border border-dashed border-border/60 text-[10px] tracking-wide text-muted-foreground/60 uppercase">
            Empty
          </div>
        ) : null}
      </div>
    </SortableContext>
  )
}
