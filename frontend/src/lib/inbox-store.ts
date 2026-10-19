import { create } from "zustand"

import type { InboxFilter } from "@/lib/inbox"

/**
 * What the Inbox page (Paper: 10c) remembers until reload: its filter chip,
 * "Unread only" and the project picked. Kept outside the page so opening a
 * record from the Inbox and coming back finds it filtered as it was left.
 * The rows themselves are server data, in SWR (lib/inbox.ts), whose
 * infinite cache keeps how many pages "Load more" revealed.
 *
 * Zustand, as in lib/board-view.ts: only hooks are exported, each selects
 * one value, and the actions, named for what happened, live in a stable
 * object of their own.
 */

export interface InboxView {
  filter: InboxFilter
  unreadOnly: boolean
  /** A Project's name, or null for every project. */
  project: string | null
}

interface InboxViewStore extends InboxView {
  actions: {
    filterChosen: (filter: InboxFilter) => void
    unreadOnlyToggled: (unreadOnly: boolean) => void
    projectChosen: (project: string | null) => void
  }
}

const useInboxViewStore = create<InboxViewStore>()((set) => ({
  filter: "all",
  unreadOnly: false,
  project: null,
  actions: {
    filterChosen: (filter) => set({ filter }),
    unreadOnlyToggled: (unreadOnly) => set({ unreadOnly }),
    projectChosen: (project) => set({ project }),
  },
}))

export function useInboxFilter(): InboxFilter {
  return useInboxViewStore((state) => state.filter)
}

export function useInboxUnreadOnly(): boolean {
  return useInboxViewStore((state) => state.unreadOnly)
}

export function useInboxProject(): string | null {
  return useInboxViewStore((state) => state.project)
}

export function useInboxViewActions() {
  return useInboxViewStore((state) => state.actions)
}
