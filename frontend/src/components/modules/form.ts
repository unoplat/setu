import { formOptions } from "@tanstack/react-form"

import type { ModuleDetail } from "@/lib/modules"

export { submitOnce, useAppForm, withForm } from "@/lib/form"
export { visibleError } from "@/components/milestones/form"

/**
 * A module's editable fields, as the Create Module panel (Paper 07a) and the
 * module page (07d) both keep them.
 */

export interface ModuleValues {
  module_name: string
  /** The rich text editor's HTML, or "" when nothing was written. */
  description: string
  /** A Frappe user id, or "" for nobody. */
  lead: string
  /** The Project's name (its id); a module always has one. */
  project: string
}

export const EMPTY_MODULE: ModuleValues = {
  module_name: "",
  description: "",
  lead: "",
  project: "",
}

export const createModuleFormOptions = formOptions({
  defaultValues: EMPTY_MODULE,
})

// Declared `string | undefined` rather than inferred, so a server message can
// later be written into the same error map without a type clash.
export function validateModuleName(value: string): string | undefined {
  return value.trim() ? undefined : "Give the module a name."
}

/**
 * Whether Create is on, and what the footer says while it is off (journey
 * guardrail "Missing or duplicate name": Create stays off until the module
 * has a name; a duplicate is caught by the server, which knows every module).
 */
export type CreateState = "creating" | "incomplete" | "ready"

export function createState(input: {
  moduleName: string
  project: string
  submitting: boolean
}): CreateState {
  if (input.submitting) return "creating"
  return input.moduleName.trim() && input.project ? "ready" : "incomplete"
}

export const MISSING_NAME = "A module name is required."
export const MISSING_PROJECT = "Choose the project it belongs to."

/**
 * Journey guardrail "Unsaved draft": closing with a name or a description
 * asks first. A lead or a project alone is one click to redo, so it closes
 * quietly. The editor reports an emptied document as "", so typing and then
 * deleting everything is not a draft either.
 */
export function hasDraft(values: ModuleValues): boolean {
  return values.module_name.trim() !== "" || values.description.trim() !== ""
}

/** A saved module as the form holds it. */
export function moduleValues(module: ModuleDetail): ModuleValues {
  return {
    module_name: module.module_name,
    description: module.description,
    lead: module.lead?.name ?? "",
    project: module.project,
  }
}

/** A module's values as they are saved and compared: the name trimmed. */
export function prepareModule(values: ModuleValues): ModuleValues {
  return { ...values, module_name: values.module_name.trim() }
}
