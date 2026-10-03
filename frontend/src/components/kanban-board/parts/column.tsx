"use client"

import { type CSSProperties, type ReactNode, useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { findSwatch, swatchCssColor } from "../lib/palette"
import type {
  AnyKanbanCardRenderer,
  KanbanColumn,
  KanbanItem,
  KanbanPaletteSwatch,
  KanbanSwimlane,
  KanbanSwimlaneHeaderContext,
} from "../types"
import { ColumnBody } from "./column-body"
import { ColumnCollapsed } from "./column-collapsed"
import { ColumnFooter } from "./column-footer"
import { ColumnHeader } from "./column-header"
import { InlineEditEditor } from "./inline-edit-editor"

export function Column({
  column,
  swimlanes,
  rendererMap,
  renderers,
  palette,
  readOnly,
  itemDrag,
  activeRendererId,
  onItemCreate,
  onItemUpdate,
  onItemDelete,
  onItemClick,
  onItemDataChange,
  onColumnUpdate,
  onColumnDelete,
  onColumnAdd,
  renderSwimlaneHeader,
  hideEmptyPlaceholder,
  onToggleSwimlaneCollapse,
  onSetColor,
  onToggleCollapse,
}: {
  column: KanbanColumn
  swimlanes: KanbanSwimlane[] | undefined
  rendererMap: Map<string, AnyKanbanCardRenderer>
  renderers: AnyKanbanCardRenderer[]
  palette: KanbanPaletteSwatch[]
  readOnly: boolean
  /** Envision: items can be dragged; defaults to `!readOnly`. */
  itemDrag?: boolean
  activeRendererId: string | undefined
  onItemCreate?: (item: KanbanItem) => void
  onItemUpdate?: (item: KanbanItem) => void
  onItemDelete?: (itemId: string) => void
  onItemClick?: (item: KanbanItem) => void
  onItemDataChange?: (item: KanbanItem) => void
  onColumnUpdate?: (column: KanbanColumn) => void
  onColumnDelete?: (columnId: string) => void
  onColumnAdd?: () => void
  // Envision: section headers + per-section collapse.
  renderSwimlaneHeader?: (ctx: KanbanSwimlaneHeaderContext) => ReactNode
  hideEmptyPlaceholder?: boolean
  onToggleSwimlaneCollapse?: (swimlaneId: string) => void
  onSetColor: (color: string | undefined) => void
  onToggleCollapse: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { kind: "column", columnId: column.id },
    // Envision: only the column's drag follows readOnly. Its droppable stays on
    // so an item can still be dropped on the column itself.
    disabled: { draggable: readOnly, droppable: false },
  })

  const [editingItem, setEditingItem] = useState<KanbanItem | null>(null)

  const swatch = findSwatch(palette, column.color)
  const accentColor = swatchCssColor(swatch)

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(accentColor ? { borderLeftColor: accentColor } : {}),
  }

  if (column.collapsed) {
    return (
      <div ref={setNodeRef} style={style}>
        <ColumnCollapsed
          column={column}
          palette={palette}
          onExpand={onToggleCollapse}
        />
      </div>
    )
  }

  const handleEdit = onItemUpdate
    ? (item: KanbanItem) => {
        const renderer = rendererMap.get(item.rendererId)
        if (!renderer?.editForm) {
          // Renderer doesn't support inline edit; just fire the callback with the existing item.
          onItemUpdate?.(item)
          return
        }
        setEditingItem(item)
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-dragging={isDragging || undefined}
      className={cn(
        "flex h-full max-h-full min-h-0 w-80 shrink-0 flex-col rounded-md border-y border-s-4 border-e border-border bg-card/40",
        isDragging && "opacity-60"
      )}
    >
      <ColumnHeader
        column={column}
        palette={palette}
        readOnly={readOnly}
        itemCount={column.items.length}
        dragHandleProps={{ ...attributes, ...listeners }}
        onColorChange={onSetColor}
        onCollapse={onToggleCollapse}
        onEdit={onColumnUpdate}
        onDelete={onColumnDelete}
        onAdd={onColumnAdd}
      />

      {editingItem ? (
        <div className="px-1.5 pb-1">
          <InlineEditEditor
            item={editingItem}
            renderer={rendererMap.get(editingItem.rendererId)!}
            onSave={(next) => {
              onItemUpdate?.(next)
              setEditingItem(null)
            }}
            onCancel={() => setEditingItem(null)}
          />
        </div>
      ) : null}

      <ColumnBody
        column={column}
        swimlanes={swimlanes}
        rendererMap={rendererMap}
        readOnly={readOnly}
        itemDrag={itemDrag}
        activeRendererId={activeRendererId}
        renderSwimlaneHeader={renderSwimlaneHeader}
        hideEmptyPlaceholder={hideEmptyPlaceholder}
        onToggleSwimlaneCollapse={onToggleSwimlaneCollapse}
        onItemClick={onItemClick}
        onItemDelete={readOnly ? undefined : onItemDelete}
        onItemEdit={readOnly ? undefined : handleEdit}
        onItemDataChange={readOnly ? undefined : onItemDataChange}
      />

      {!readOnly && onItemCreate ? (
        <ColumnFooter
          column={column}
          renderers={renderers}
          onCreate={onItemCreate}
        />
      ) : null}
    </div>
  )
}
