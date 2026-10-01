import { describe, expect, it } from "vite-plus/test"

import { adoptable, pendingFields, sameValue } from "./autosave"
import { dueHint, formatShortDay } from "./milestones"

interface Values {
  title: string
  description: string
  tags: string[]
}

const base: Values = { title: "Ship", description: "<p>a</p>", tags: ["x"] }

describe("sameValue", () => {
  it("compares lists by their items", () => {
    expect(sameValue(["a", "b"], ["a", "b"])).toBe(true)
    expect(sameValue(["a", "b"], ["b", "a"])).toBe(false)
    expect(sameValue("a", "a")).toBe(true)
  })
})

describe("pendingFields", () => {
  it("names only the fields that differ from the saved record", () => {
    expect(pendingFields(base, base)).toEqual([])
    expect(
      pendingFields({ ...base, title: "Ship it", tags: ["x", "y"] }, base)
    ).toEqual(["title", "tags"])
  })
})

describe("adoptable", () => {
  it("takes the server's cleaned-up value for a field left as it was sent", () => {
    const values = { ...base, description: "<p>b</p><p></p>" }
    const saved = { ...base, description: "<p>b</p>" }
    expect(
      adoptable({
        values,
        base,
        sent: { description: values.description },
        saved,
      })
    ).toEqual({ description: "<p>b</p>" })
  })

  it("keeps what was typed while the save was in flight", () => {
    const saved = { ...base, title: "Ship it" }
    expect(
      adoptable({
        values: { ...base, title: "Ship it now" },
        base,
        sent: { title: "Ship it" },
        saved,
      })
    ).toEqual({})
  })

  it("takes a change made elsewhere to a field with no edit pending", () => {
    const saved = { ...base, tags: ["x", "y"] }
    expect(
      adoptable({ values: { ...base, title: "Mine" }, base, saved })
    ).toEqual({ tags: ["x", "y"] })
  })

  it("does not overwrite a pending edit with a change made elsewhere", () => {
    const saved = { ...base, title: "Theirs" }
    expect(
      adoptable({ values: { ...base, title: "Mine" }, base, saved })
    ).toEqual({})
  })
})

describe("dueHint", () => {
  const today = new Date(2026, 3, 9)

  it("counts days, then weeks", () => {
    expect(dueHint("2026-04-09", today)).toEqual({
      text: "Due today",
      overdue: false,
    })
    expect(dueHint("2026-04-10", today).text).toBe("Due tomorrow")
    expect(dueHint("2026-04-12", today).text).toBe("Due in 3 days")
    expect(dueHint("2026-04-30", today).text).toBe("Due in 3 weeks")
  })

  it("flags a date that has passed", () => {
    expect(dueHint("2026-04-08", today)).toEqual({
      text: "1 day overdue",
      overdue: true,
    })
    expect(dueHint("2026-04-01", today).text).toBe("8 days overdue")
  })
})

describe("formatShortDay", () => {
  it("leaves the year off within this one", () => {
    const today = new Date(2026, 3, 9)
    expect(formatShortDay("2026-04-14", today)).toBe("Apr 14")
    expect(formatShortDay("2025-12-01", today)).toBe("Dec 1, 2025")
  })
})
