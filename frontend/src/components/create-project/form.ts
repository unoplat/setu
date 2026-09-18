import {
  createFormHook,
  createFormHookContexts,
  formOptions,
} from "@tanstack/react-form"

/**
 * TanStack Form setup for the Create Project dialog, following the
 * multi-step-wizard example: one form holds the values and each view is a
 * `withForm` sub-form, so further steps can be added as their own `FormGroup`.
 */

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {},
  formComponents: {},
  fieldContext,
  formContext,
})

export interface CreateProjectValues {
  details: {
    project_name: string
    /** Markdown, edited inline as text or in the expanded MDXEditor. */
    description: string
  }
}

export const createProjectFormOptions = formOptions({
  defaultValues: {
    details: { project_name: "", description: "" },
  } as CreateProjectValues,
})

export function validateProjectName(value: string): string | undefined {
  return value.trim() ? undefined : "Give the project a name."
}
