import { createFormHook, createFormHookContexts } from "@tanstack/react-form"

/**
 * TanStack Form setup shared by Envision's forms: one `useAppForm` owns the
 * values and submits them, and a form's view is a `withForm` component.
 */

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {},
  formComponents: {},
  fieldContext,
  formContext,
})

/**
 * Submit unless a submit is already running. `handleSubmit` itself never
 * refuses a second call (Mod+Enter twice, or Enter then Mod+Enter): it
 * validates again and flips `isSubmitting` back to false while the first
 * request is still pending, which would re-enable Cancel and closing
 * mid-request. `isSubmitting` turns true before `handleSubmit`'s first await,
 * so checking it here covers every caller.
 */
export function submitOnce(form: {
  state: { isSubmitting: boolean }
  handleSubmit: () => Promise<void>
}): Promise<void> {
  return form.state.isSubmitting ? Promise.resolve() : form.handleSubmit()
}

export function validateProjectName(value: string): string | undefined {
  return value.trim() ? undefined : "Give the project a name."
}
