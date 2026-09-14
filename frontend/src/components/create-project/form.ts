import {
  createFormHook,
  createFormHookContexts,
  formOptions,
} from "@tanstack/react-form"

/**
 * TanStack Form setup for the Create Project wizard, following the
 * multi-step-wizard example: one form holds every step's values, each step is
 * a `withForm` sub-form that submits its own `FormGroup`, and only the last
 * step calls `form.handleSubmit()`.
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
  members: {
    /** Frappe User ids picked in step 2. */
    users: string[]
  }
}

export const createProjectFormOptions = formOptions({
  defaultValues: {
    details: { project_name: "", description: "" },
    members: { users: [] },
  } as CreateProjectValues,
})

export function validateProjectName(value: string): string | undefined {
  return value.trim() ? undefined : "Give the project a name."
}
