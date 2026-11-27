import { create } from "zustand"

/**
 * Whether the phone's saved views sheet is open. The sheet lives in the
 * Board's phone header (mobile-board-header.tsx); the header's title and a
 * second tap on the tab bar's My tasks open it from here.
 */
const useViewsSheetStore = create<{ open: boolean }>()(() => ({ open: false }))

export function setViewsSheetOpen(open: boolean) {
  useViewsSheetStore.setState({ open })
}

export function openViewsSheet() {
  setViewsSheetOpen(true)
}

export function useViewsSheetOpen(): boolean {
  return useViewsSheetStore((state) => state.open)
}
