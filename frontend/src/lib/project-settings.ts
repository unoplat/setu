import { useFrappeGetCall } from "frappe-react-sdk"

/** What setu.api.project.get_project_settings returns. */
export interface ProjectSettings {
  name: string
  project_name: string
  /** Saved description HTML, or "" when there is none. */
  description: string
  /** Tasks and subtasks still on the project; deleting is refused above 0. */
  task_count: number
  /** Whether this user may delete the project (creator or Projects Manager). */
  can_delete: boolean
}

export function projectSettingsKey(name: string) {
  return ["envision:project-settings", name]
}

/** The Project Settings screen's data, keyed per project for revalidation. */
export function useProjectSettings(name: string) {
  return useFrappeGetCall<{ message: ProjectSettings }>(
    "setu.api.project.get_project_settings",
    { name },
    projectSettingsKey(name)
  )
}
