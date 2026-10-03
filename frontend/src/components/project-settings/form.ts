import { formOptions } from "@tanstack/react-form"

import type { ProjectSettings } from "@/lib/project-settings"

export {
  submitOnce,
  useAppForm,
  validateProjectName,
  withForm,
} from "@/lib/form"

/**
 * The General section of Project Settings (Paper screen 05): the form holds
 * the saved values as its defaults, so "unsaved changes" is simply the form
 * no longer matching them.
 */

export interface ProjectSettingsValues {
  project_name: string
  /** The rich text editor's HTML, or "" when there is none. */
  description: string
}

export function settingsValues(
  settings: ProjectSettings
): ProjectSettingsValues {
  return {
    project_name: settings.project_name,
    description: settings.description,
  }
}

export function projectSettingsFormOptions(values: ProjectSettingsValues) {
  return formOptions({ defaultValues: values })
}

/** What the save row says and whether Save is on (journey: "Save stays off
 * until something changes", "keep Save disabled and explain that the project
 * name is required"). */
export type SaveState = "pristine" | "dirty" | "missing-name" | "saving"

export function saveState(input: {
  dirty: boolean
  projectName: string
  submitting: boolean
}): SaveState {
  if (input.submitting) return "saving"
  if (!input.projectName.trim()) return "missing-name"
  return input.dirty ? "dirty" : "pristine"
}

export const SAVE_STATUS: Record<SaveState, string> = {
  pristine: "No unsaved changes",
  dirty: "Unsaved changes",
  "missing-name": "Project name is required.",
  saving: "Saving…",
}

/** Which dialog the Delete button opens: the refusal comes up front while
 * tasks remain, rather than after a typed confirmation. */
export function deleteDialogFor(
  settings: Pick<ProjectSettings, "task_count">
): "confirm" | "refused" {
  return settings.task_count > 0 ? "refused" : "confirm"
}

/** The typed confirmation has to be the project's name, as shown. */
export function confirmsDeletion(typed: string, projectName: string): boolean {
  return typed.trim() === projectName.trim()
}
