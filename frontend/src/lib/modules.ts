import { useFrappeGetCall } from "frappe-react-sdk"

import type { Assignee } from "@/lib/assignees"
import { useConfirmCount } from "@/lib/confirm-count"

/**
 * A project's modules: its lasting parts, such as Payments or Onboarding,
 * each with an optional lead. A module is an Envision Module record (see
 * setu/api/module.py), with no status and no dates.
 */

export interface Module {
  name: string
  module_name: string
  /** The rich text editor's HTML, or "" when there is none. */
  description: string
  /** The description's opening words as plain text, for the table. */
  summary: string
  lead: Assignee | null
}

/** Shared SWR key so a create can revalidate the list that is on screen. */
export function modulesKey(project: string) {
  return ["envision:modules", project]
}

export function useModules(project: string) {
  return useFrappeGetCall<{ message: Module[] }>(
    "setu.api.module.list_modules",
    { project },
    modulesKey(project)
  )
}

/** A module as its detail screen needs it (setu.api.module.get_module). */
export interface ModuleDetail extends Module {
  project: string
  project_name: string | null
  owner: string
  /** ISO datetimes with their offsets. */
  creation: string
  modified: string
  /** Whether this user may edit it; read-only viewers get no editor. */
  can_write: boolean
}

export function moduleKey(name: string) {
  return ["envision:module", name]
}

export function useModule(name: string) {
  return useFrappeGetCall<{ message: ModuleDetail }>(
    "setu.api.module.get_module",
    { name },
    moduleKey(name)
  )
}

/**
 * How many Tasks deleting the module moves to No module, for its confirm
 * (setu.api.module.count_module_tasks).
 */
export function useModuleTaskCount(name: string) {
  return useConfirmCount<{ tasks: number }>(
    "setu.api.module.count_module_tasks",
    { name },
    ["envision:module-tasks", name]
  )
}

/** The module's timeline (setu.api.module.get_module_activity). */
export function moduleActivityKey(name: string) {
  return ["envision:module-activity", name]
}
