import type { ReactNode } from "react"

export type KanbanRenderContext = {
  itemId: string
  columnId: string
  swimlaneId?: string
  isDragging: boolean
  isLocked: boolean
  /**
   * Persist an edit to this item's `data` back into the board (additive, v0.4).
   * A renderer that owns its own edit UI (e.g. the card-tree adapter) calls this
   * with the next data; the board dispatches `update-item` and notifies `onItemUpdate`.
   * Undefined in read-only mode or when the item is locked. The renderer is
   * responsible for passing data of its own `TData` shape.
   */
  onDataChange?: (nextData: unknown) => void
}

export type KanbanCardRenderer<TData = unknown> = {
  id: string
  label: string
  render: (data: TData, ctx: KanbanRenderContext) => ReactNode
  newItem?: () => TData
  editForm?: (
    data: TData,
    onSave: (next: TData) => void,
    onCancel: () => void
  ) => ReactNode
  /**
   * Where the kanban-level drag listeners attach.
   * - `"shell"` (default): the entire item is the drag activator (cursor-grab on the whole card).
   * - `"header"`: only a thin grip strip rendered above the item activates dragging; the body
   *    stays fully interactive. Use for renderers that own internal pointer interactions
   *    (inline editors, nested DnD), e.g. the card-tree adapter.
   */
  dragHandle?: "shell" | "header"
}

/**
 * Type-erased renderer used inside the board's registry. The board never reads
 * the data shape — it just hands data to the renderer's render fn — so erasing
 * TData here is sound. Consumers always interact with the typed
 * `KanbanCardRenderer<TData>` surface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyKanbanCardRenderer = KanbanCardRenderer<any>

export type KanbanItem = {
  id: string
  rendererId: string
  data: unknown
  swimlaneId?: string
  locked?: boolean
}

export type KanbanColumn = {
  id: string
  title: string
  description?: string
  color?: string
  collapsed?: boolean
  items: KanbanItem[]
  allowReorder?: boolean
  allowIncoming?: boolean
  allowOutgoing?: boolean
  acceptsRendererIds?: string[]
  maxItems?: number
  /** Envision: ids of the swimlanes (sections) collapsed in this column. A collapsed section shows its header only. */
  collapsedSwimlanes?: string[]
}

export type KanbanSwimlane = {
  id: string
  title: string
  description?: string
  color?: string
}

/** Envision: what `renderSwimlaneHeader` gets for one section of one column. */
export type KanbanSwimlaneHeaderContext = {
  column: KanbanColumn
  swimlane: KanbanSwimlane
  collapsed: boolean
  /** Items in this column's section. */
  itemCount: number
  readOnly: boolean
  onToggleCollapse: () => void
}

export type KanbanData = {
  columns: KanbanColumn[]
  swimlanes?: KanbanSwimlane[]
}

export type KanbanPaletteSwatch = {
  id: string
  label: string
  cssVar: string
}

export type KanbanBoardProps = {
  renderers: AnyKanbanCardRenderer[]

  data?: KanbanData
  defaultData?: KanbanData
  onChange?: (next: KanbanData) => void

  /** Item-create handler — object-shape. v0.2 cutover from `(columnId, item)`. */
  onItemCreate?: (args: { columnId: string; item: KanbanItem }) => void
  onItemUpdate?: (item: KanbanItem) => void
  onItemDelete?: (itemId: string) => void
  onColumnCreate?: (column: KanbanColumn) => void
  onColumnUpdate?: (column: KanbanColumn) => void
  onColumnDelete?: (columnId: string) => void
  /**
   * Header "+" action for a column (Envision addition). Unlike `onItemCreate`,
   * which opens the inline editor, this hands the column to the consumer (e.g.
   * to open its own create form) and shows even when `readOnly`.
   */
  onColumnAdd?: (columnId: string) => void
  /** Envision: draws each section's header; stock ilinxa prints a plain label. */
  renderSwimlaneHeader?: (ctx: KanbanSwimlaneHeaderContext) => ReactNode
  /** Envision: leave out the dashed "Empty" box in empty cells. */
  hideEmptyPlaceholder?: boolean
  /**
   * Envision: how swimlanes are laid out. "sections" (default) repeats each
   * one inside every column. "rows" runs each across all columns under one
   * header that stays in view, so a dragged card never covers the name of the
   * swimlane it is over. Rows is for boards whose columns are fixed: it has no
   * column reorder, collapse or editing, and without swimlanes it falls back
   * to "sections".
   */
  layout?: "sections" | "rows"
  /** Envision, rows layout: the "+" on a swimlane's header. */
  onSwimlaneAdd?: (swimlaneId: string) => void
  /**
   * Envision: what follows the pointer during a drag instead of the full
   * card. Keep it small, so it does not hide where the card will land.
   */
  renderDragPreview?: (item: KanbanItem) => ReactNode
  /**
   * Envision: the consumer puts a moved item first in its new cell whatever
   * the drop position, so the drop line is drawn at the top of the target.
   * Without it no line is drawn.
   */
  dropLandsFirst?: boolean

  onItemClick?: (item: KanbanItem) => void
  /** Item-move handler — object-shape. v0.2 cutover from `(item, from, to)`. */
  onItemMove?: (args: {
    item: KanbanItem
    from: { columnId: string; swimlaneId?: string }
    to: { columnId: string; swimlaneId?: string }
  }) => void

  palette?: KanbanPaletteSwatch[]
  readOnly?: boolean
  /**
   * Envision: let items be dragged between cells even when `readOnly`. Columns
   * still cannot be reordered and nothing else becomes editable; the consumer
   * persists each move through `onItemMove`.
   */
  allowItemDrag?: boolean

  "aria-label"?: string
  className?: string
}

export type KanbanCardData = {
  title: string
  description?: string
  tags?: { label: string; color?: string }[]
  assignees?: { id: string; name: string; avatarUrl?: string }[]
  /** Serializable cell value. Arbitrary nodes belong behind a renderer's `render` fn, not in JSON data. */
  meta?: { key: string; label: string; value: string | number }[]
}

export type KanbanNoteData = {
  title: string
  body?: string
  color?: string
}

export type KanbanAction =
  | {
      type: "move-item"
      itemId: string
      toColumnId: string
      toIndex: number
      toSwimlaneId?: string
    }
  | { type: "reorder-column"; columnId: string; toIndex: number }
  | { type: "create-item"; columnId: string; item: KanbanItem; index?: number }
  | { type: "update-item"; item: KanbanItem }
  | { type: "delete-item"; itemId: string }
  | { type: "create-column"; column: KanbanColumn; index?: number }
  | { type: "update-column"; column: KanbanColumn }
  | { type: "delete-column"; columnId: string }
  | { type: "toggle-collapse"; columnId: string }
  | { type: "toggle-swimlane-collapse"; columnId: string; swimlaneId: string }
  | { type: "toggle-swimlane-row"; swimlaneId: string }
  | { type: "set-color"; columnId: string; color: string | undefined }
  | { type: "replace"; data: KanbanData }
