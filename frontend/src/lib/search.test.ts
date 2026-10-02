import { describe, expect, it } from "vite-plus/test"

import {
  groupResults,
  isSearchable,
  nameLeads,
  type RecordType,
  type SearchResult,
} from "@/lib/search"

function result(type: RecordType, name: string): SearchResult {
  return {
    type,
    name,
    title: name,
    project: "PROJ-0001",
    project_name: "Customer Portal",
    status: type === "module" ? null : "Open",
    matched_in: ["title"],
    excerpt: [],
  }
}

describe("groupResults", () => {
  it("groups by kind in the dialog's order: tasks, modules, milestones", () => {
    const groups = groupResults([
      result("milestone", "Private beta"),
      result("task", "Review rules"),
      result("module", "Access control"),
      result("task", "Guest access"),
    ])
    expect(groups.map((group) => group.heading)).toEqual([
      "Tasks",
      "Modules",
      "Milestones",
    ])
    expect(groups[0].results.map((row) => row.name)).toEqual([
      "Review rules",
      "Guest access",
    ])
  })

  it("leaves out kinds with no results", () => {
    const groups = groupResults([result("module", "Access control")])
    expect(groups.map((group) => group.type)).toEqual(["module"])
  })
})

describe("nameLeads", () => {
  it("leads when a word of the name starts with the query", () => {
    expect(nameLeads("Go to Settings", "set")).toBe(true)
    expect(nameLeads("Customer Portal", "port")).toBe(true)
  })

  it("does not lead on a match inside a word", () => {
    expect(nameLeads("Go to Settings", "tings")).toBe(false)
  })

  it("matches a query of several words anywhere in the name", () => {
    expect(nameLeads("Toggle dark mode", "dark mo")).toBe(true)
  })

  it("never leads on an empty query", () => {
    expect(nameLeads("Go to Inbox", "  ")).toBe(false)
  })
})

describe("isSearchable", () => {
  it("searches from the second letter, ignoring spaces", () => {
    expect(isSearchable(" a ")).toBe(false)
    expect(isSearchable("ab")).toBe(true)
  })
})
