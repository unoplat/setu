import { describe, expect, it } from "vite-plus/test"

import type { KanbanData } from "@/components/kanban-board"

import {
  NO_MODULE_SECTION,
  nextSectionOverrides,
  sectionCreateModule,
  sectionKey,
  toBoardData,
  type BoardView,
  type SectionOverride,
  type TaskSummary,
} from "./tasks"

const lookups = {
  milestones: new Map(),
  modules: new Map(),
  people: new Map(),
}
const modules = [
  { name: "MOD-00002", module_name: "Onboarding" },
  { name: "MOD-00001", module_name: "Payments" },
]

function task(name: string, module: string | null, status = "Open") {
  return {
    name,
    subject: name,
    status,
    priority: null,
    exp_start_date: null,
    exp_end_date: null,
    _assign: null,
    _user_tags: null,
    envision_milestone: null,
    envision_module: module,
  } satisfies TaskSummary
}

function view(sections: [string, SectionOverride][] = []): BoardView {
  return { collapsedColumns: new Set(), sections: new Map(sections) }
}

const todo = (data: KanbanData) => data.columns[0]

describe("toBoardData", () => {
  it("has no sections when the Project has no Modules", () => {
    const data = toBoardData([task("T1", null)], [], view(), lookups)
    expect(data.swimlanes).toBeUndefined()
    expect(todo(data).collapsedSwimlanes).toBeUndefined()
    expect(todo(data).items[0].swimlaneId).toBeUndefined()
  })

  it("puts No module first and keeps the Modules' order", () => {
    const data = toBoardData([], modules, view(), lookups)
    expect(data.swimlanes?.map((s) => s.id)).toEqual([
      NO_MODULE_SECTION,
      "MOD-00002",
      "MOD-00001",
    ])
    expect(data.swimlanes?.[0].title).toBe("No module")
  })

  it("sends Tasks with an unknown Module to No module", () => {
    const tasks = [task("T1", "MOD-99999"), task("T2", "MOD-00001")]
    const items = todo(toBoardData(tasks, modules, view(), lookups)).items
    expect(items.map((i) => i.swimlaneId)).toEqual([
      NO_MODULE_SECTION,
      "MOD-00001",
    ])
  })

  it("collapses empty sections and opens the ones with cards", () => {
    const data = toBoardData(
      [task("T1", "MOD-00001")],
      modules,
      view(),
      lookups
    )
    expect(todo(data).collapsedSwimlanes).toEqual([
      NO_MODULE_SECTION,
      "MOD-00002",
    ])
  })

  it("lets the user's choice win", () => {
    const key = sectionKey("todo", "MOD-00001")
    const v = view([[key, { collapsed: true, wasEmpty: false }]])
    const data = toBoardData([task("T1", "MOD-00001")], modules, v, lookups)
    expect(todo(data).collapsedSwimlanes).toContain("MOD-00001")
  })

  it("drops a choice made while empty once a Task arrives", () => {
    const key = sectionKey("todo", "MOD-00001")
    const v = view([[key, { collapsed: true, wasEmpty: true }]])
    const data = toBoardData([task("T1", "MOD-00001")], modules, v, lookups)
    expect(todo(data).collapsedSwimlanes).not.toContain("MOD-00001")
  })
})

describe("nextSectionOverrides", () => {
  const current = toBoardData(
    [task("T1", "MOD-00001")],
    modules,
    view(),
    lookups
  )

  it("records only the sections that changed", () => {
    const next: KanbanData = {
      ...current,
      columns: current.columns.map((c) =>
        c.id === "todo"
          ? { ...c, collapsedSwimlanes: [NO_MODULE_SECTION, "MOD-00001"] }
          : c
      ),
    }
    const result = nextSectionOverrides(current, next, new Map())
    expect(result.get(sectionKey("todo", "MOD-00001"))).toEqual({
      collapsed: true,
      wasEmpty: false,
    })
    expect(result.get(sectionKey("todo", "MOD-00002"))).toEqual({
      collapsed: false,
      wasEmpty: true,
    })
    expect(result.has(sectionKey("todo", NO_MODULE_SECTION))).toBe(false)
  })

  it("returns the same map when nothing changed", () => {
    const sections = new Map<string, SectionOverride>()
    expect(nextSectionOverrides(current, current, sections)).toBe(sections)
  })
})

describe("sectionCreateModule", () => {
  it("is empty for No module and the Module's id otherwise", () => {
    expect(sectionCreateModule(NO_MODULE_SECTION)).toBe("")
    expect(sectionCreateModule("MOD-00001")).toBe("MOD-00001")
  })
})
