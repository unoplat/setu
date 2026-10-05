import { create } from "zustand"

/**
 * Which Custom View is being renamed or deleted. One pair of dialogs lives in
 * the app shell (ViewDialogs); the sidebar's ⋯ menu and the "Rename" action
 * on the saved toast open them from here instead of owning their own.
 */

export interface ViewTarget {
  /** The view's Project; null for a My tasks view. */
  project: string | null
  view: { name: string; view_name: string }
}

interface ViewDialogStore {
  renaming: ViewTarget | null
  deleting: ViewTarget | null
}

const useViewDialogStore = create<ViewDialogStore>()(() => ({
  renaming: null,
  deleting: null,
}))

export function openRenameView(target: ViewTarget) {
  useViewDialogStore.setState({ renaming: target })
}

export function closeRenameView() {
  useViewDialogStore.setState({ renaming: null })
}

export function openDeleteView(target: ViewTarget) {
  useViewDialogStore.setState({ deleting: target })
}

export function closeDeleteView() {
  useViewDialogStore.setState({ deleting: null })
}

export function useRenamingView(): ViewTarget | null {
  return useViewDialogStore((state) => state.renaming)
}

export function useDeletingView(): ViewTarget | null {
  return useViewDialogStore((state) => state.deleting)
}
