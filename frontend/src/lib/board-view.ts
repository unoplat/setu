import { create } from "zustand"

import type { KanbanData } from "@/components/kanban-board"
import { nextSectionOverrides, type BoardView } from "@/lib/tasks"

/**
 * What each Project's Board remembers until reload: its collapsed columns and
 * the sections the user opened or closed. Kept outside the page so opening a
 * Task and coming back finds the Board as it was left; page state would be
 * gone once the route unmounts.
 *
 * Zustand, used as its docs and TkDodo's "Working with Zustand" advise: only
 * hooks are exported, each selects one value, and the actions, named for what
 * happened rather than for what to set, live in a stable object of their own,
 * so a component that only acts never re-renders.
 */

const EMPTY_VIEW: BoardView = {
  collapsedColumns: new Set(),
  sections: new Map(),
}

interface BoardViewStore {
  /** By Project name; a Project the user has not touched has no entry. */
  views: Readonly<Partial<Record<string, BoardView>>>
  actions: {
    /**
     * The Board reported a change: `previous` is the data it was given, `next`
     * what it reports. A view that comes out the same leaves the store alone,
     * so nothing re-renders.
     */
    boardChanged: (
      project: string,
      previous: KanbanData,
      next: KanbanData
    ) => void
  }
}

const useBoardViewStore = create<BoardViewStore>()((set) => ({
  views: {},
  actions: {
    boardChanged: (project, previous, next) =>
      set((state) => {
        const current = state.views[project] ?? EMPTY_VIEW
        const ids = next.columns.filter((c) => c.collapsed).map((c) => c.id)
        const sections = nextSectionOverrides(previous, next, current.sections)
        const sameColumns =
          ids.length === current.collapsedColumns.size &&
          ids.every((id) => current.collapsedColumns.has(id))
        if (sameColumns && sections === current.sections) return state
        return {
          views: {
            ...state.views,
            [project]: {
              collapsedColumns: sameColumns
                ? current.collapsedColumns
                : new Set(ids),
              sections,
            },
          },
        }
      }),
  },
}))

/**
 * A Project's Board view. A fresh Project gets one shared empty view, never a
 * new object per render, which Zustand would treat as a change every time.
 */
export function useBoardView(project: string): BoardView {
  return useBoardViewStore((state) => state.views[project] ?? EMPTY_VIEW)
}

export function useBoardViewActions() {
  return useBoardViewStore((state) => state.actions)
}
