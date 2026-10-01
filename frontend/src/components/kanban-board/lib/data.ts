import type {
  AnyKanbanCardRenderer,
  KanbanColumn,
  KanbanData,
  KanbanItem,
} from "../types"

export function findItem(
  data: KanbanData,
  itemId: string
): { item: KanbanItem; columnId: string; index: number } | null {
  for (const col of data.columns) {
    const idx = col.items.findIndex((it) => it.id === itemId)
    if (idx >= 0) return { item: col.items[idx], columnId: col.id, index: idx }
  }
  return null
}

export function findColumn(
  data: KanbanData,
  columnId: string
): { column: KanbanColumn; index: number } | null {
  const idx = data.columns.findIndex((c) => c.id === columnId)
  if (idx < 0) return null
  return { column: data.columns[idx], index: idx }
}

export function moveItem(
  data: KanbanData,
  itemId: string,
  toColumnId: string,
  toIndex: number,
  toSwimlaneId?: string
): KanbanData {
  const found = findItem(data, itemId)
  if (!found) return data

  const movingItem: KanbanItem = {
    ...found.item,
    swimlaneId:
      toSwimlaneId !== undefined ? toSwimlaneId : found.item.swimlaneId,
  }

  // Remove from source column.
  const stripped: KanbanColumn[] = data.columns.map((c) => {
    if (c.id !== found.columnId) return c
    return { ...c, items: c.items.filter((it) => it.id !== itemId) }
  })

  // Insert into target column. Auto-expand if target was collapsed
  // (locked contract: "drop on collapsed → expand"; bundled into the move
  // action so it's atomic in both controlled and uncontrolled modes).
  // Envision: the section it lands in opens too, so a card dropped on a folded
  // section's header does not vanish into it.
  const lane = movingItem.swimlaneId
  const result = stripped.map((c) => {
    if (c.id !== toColumnId) return c
    const next = c.items.slice()
    const clamped = Math.max(0, Math.min(toIndex, next.length))
    next.splice(clamped, 0, movingItem)
    return {
      ...c,
      items: next,
      collapsed: c.collapsed ? false : c.collapsed,
      ...(lane !== undefined &&
        c.collapsedSwimlanes?.includes(lane) && {
          collapsedSwimlanes: c.collapsedSwimlanes.filter((id) => id !== lane),
        }),
    }
  })

  return { ...data, columns: result }
}

export function reorderColumn(
  data: KanbanData,
  columnId: string,
  toIndex: number
): KanbanData {
  const fromIdx = data.columns.findIndex((c) => c.id === columnId)
  if (fromIdx < 0) return data
  const cols = data.columns.slice()
  const [removed] = cols.splice(fromIdx, 1)
  const clamped = Math.max(0, Math.min(toIndex, cols.length))
  cols.splice(clamped, 0, removed)
  return { ...data, columns: cols }
}

export function addItem(
  data: KanbanData,
  columnId: string,
  item: KanbanItem,
  index?: number
): KanbanData {
  return {
    ...data,
    columns: data.columns.map((c) => {
      if (c.id !== columnId) return c
      const next = c.items.slice()
      const at =
        index === undefined
          ? next.length
          : Math.max(0, Math.min(index, next.length))
      next.splice(at, 0, item)
      return { ...c, items: next }
    }),
  }
}

export function updateItem(data: KanbanData, item: KanbanItem): KanbanData {
  return {
    ...data,
    columns: data.columns.map((c) => ({
      ...c,
      items: c.items.map((it) => (it.id === item.id ? item : it)),
    })),
  }
}

export function deleteItem(data: KanbanData, itemId: string): KanbanData {
  return {
    ...data,
    columns: data.columns.map((c) => ({
      ...c,
      items: c.items.filter((it) => it.id !== itemId),
    })),
  }
}

export function addColumn(
  data: KanbanData,
  column: KanbanColumn,
  index?: number
): KanbanData {
  const next = data.columns.slice()
  const at =
    index === undefined
      ? next.length
      : Math.max(0, Math.min(index, next.length))
  next.splice(at, 0, column)
  return { ...data, columns: next }
}

export function updateColumn(
  data: KanbanData,
  column: KanbanColumn
): KanbanData {
  return {
    ...data,
    columns: data.columns.map((c) => (c.id === column.id ? column : c)),
  }
}

export function deleteColumn(data: KanbanData, columnId: string): KanbanData {
  return { ...data, columns: data.columns.filter((c) => c.id !== columnId) }
}

export function toggleCollapse(data: KanbanData, columnId: string): KanbanData {
  return {
    ...data,
    columns: data.columns.map((c) =>
      c.id === columnId ? { ...c, collapsed: !c.collapsed } : c
    ),
  }
}

// Envision: collapse one section (swimlane) inside one column.
export function toggleSwimlaneCollapse(
  data: KanbanData,
  columnId: string,
  swimlaneId: string
): KanbanData {
  return {
    ...data,
    columns: data.columns.map((c) => {
      if (c.id !== columnId) return c
      const current = c.collapsedSwimlanes ?? []
      return {
        ...c,
        collapsedSwimlanes: current.includes(swimlaneId)
          ? current.filter((id) => id !== swimlaneId)
          : [...current, swimlaneId],
      }
    }),
  }
}

/**
 * Envision, rows layout: a swimlane runs across every column, so it is folded
 * only when it is folded in all of them.
 */
export function isSwimlaneRowCollapsed(
  columns: KanbanColumn[],
  swimlaneId: string
): boolean {
  return (
    columns.length > 0 &&
    columns.every((c) => c.collapsedSwimlanes?.includes(swimlaneId))
  )
}

/** Envision, rows layout: fold or open one swimlane in every column. */
export function toggleSwimlaneRow(
  data: KanbanData,
  swimlaneId: string
): KanbanData {
  const open = isSwimlaneRowCollapsed(data.columns, swimlaneId)
  return {
    ...data,
    columns: data.columns.map((c) => {
      const current = c.collapsedSwimlanes ?? []
      const folded = current.includes(swimlaneId)
      if (folded !== open) return c
      return {
        ...c,
        collapsedSwimlanes: open
          ? current.filter((id) => id !== swimlaneId)
          : [...current, swimlaneId],
      }
    }),
  }
}

export function setColumnColor(
  data: KanbanData,
  columnId: string,
  color: string | undefined
): KanbanData {
  return {
    ...data,
    columns: data.columns.map((c) => (c.id === columnId ? { ...c, color } : c)),
  }
}

export type ValidationResult = { valid: boolean; errors: string[] }

export function validateData(
  data: KanbanData,
  renderers: AnyKanbanCardRenderer[]
): ValidationResult {
  const errors: string[] = []
  const rendererIds = new Set(renderers.map((r) => r.id))
  const swimlaneIds = new Set((data.swimlanes ?? []).map((l) => l.id))
  const colIds = new Set<string>()
  const itemIds = new Set<string>()

  for (const col of data.columns) {
    if (colIds.has(col.id)) errors.push(`Duplicate column id: ${col.id}`)
    colIds.add(col.id)
    for (const item of col.items) {
      if (itemIds.has(item.id)) errors.push(`Duplicate item id: ${item.id}`)
      itemIds.add(item.id)
      if (!rendererIds.has(item.rendererId)) {
        errors.push(
          `Item ${item.id} references unknown renderer: ${item.rendererId}`
        )
      }
      if (
        item.swimlaneId &&
        data.swimlanes &&
        !swimlaneIds.has(item.swimlaneId)
      ) {
        errors.push(
          `Item ${item.id} references unknown swimlane: ${item.swimlaneId}`
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
