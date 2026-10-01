import { describe, expect, it } from "vite-plus/test"

import type { KanbanData, KanbanItem } from "../types"
import { isSwimlaneRowCollapsed, moveItem, toggleSwimlaneRow } from "./data"

function item(id: string, swimlaneId: string): KanbanItem {
  return { id, rendererId: "card", data: null, swimlaneId }
}

function board(): KanbanData {
  return {
    swimlanes: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ],
    columns: [
      {
        id: "todo",
        title: "Todo",
        items: [item("1", "a")],
        collapsedSwimlanes: ["b"],
      },
      { id: "done", title: "Done", items: [], collapsedSwimlanes: ["a", "b"] },
    ],
  }
}

describe("isSwimlaneRowCollapsed", () => {
  it("is folded only when every column folds it", () => {
    expect(isSwimlaneRowCollapsed(board().columns, "a")).toBe(false)
    expect(isSwimlaneRowCollapsed(board().columns, "b")).toBe(true)
  })
})

describe("toggleSwimlaneRow", () => {
  it("folds a row in every column", () => {
    const next = toggleSwimlaneRow(board(), "a")
    expect(next.columns.map((c) => c.collapsedSwimlanes)).toEqual([
      ["b", "a"],
      ["a", "b"],
    ])
  })

  it("opens a folded row in every column", () => {
    const next = toggleSwimlaneRow(board(), "b")
    expect(next.columns.map((c) => c.collapsedSwimlanes)).toEqual([[], ["a"]])
  })

  it("keeps the columns it does not change", () => {
    const data = board()
    expect(toggleSwimlaneRow(data, "a").columns[1]).toBe(data.columns[1])
  })
})

describe("moveItem", () => {
  it("opens the section the item lands in", () => {
    const next = moveItem(board(), "1", "done", 0, "b")
    expect(next.columns[1].items.map((i) => i.id)).toEqual(["1"])
    expect(next.columns[1].collapsedSwimlanes).toEqual(["a"])
    // Only where it landed: the same lane stays folded in the other column.
    expect(next.columns[0].collapsedSwimlanes).toEqual(["b"])
  })

  it("leaves a column with no folded sections as it was", () => {
    const data: KanbanData = {
      columns: [
        { id: "todo", title: "Todo", items: [item("1", "a")] },
        { id: "done", title: "Done", items: [] },
      ],
    }
    const next = moveItem(data, "1", "done", 0)
    expect("collapsedSwimlanes" in next.columns[1]).toBe(false)
  })
})
