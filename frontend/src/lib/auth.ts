/**
 * Auth state handed to the router via `RouterProvider` context.
 *
 * Frappe owns the session (cookie-based). The SDK's `useFrappeAuth` reports
 * the signed-in user id, or null for Guest. Route guards use this for
 * navigation only; the real access boundary is enforced by Frappe on the
 * server (see docs/adr/0001-reuse-erpnext-project-and-task-records.md).
 */
export interface AuthState {
  /** Frappe user id (usually the email), or null when signed out. */
  currentUser: string | null
}

/** Frappe's own login page, which returns to `redirectTo` after sign-in. */
export function frappeLoginHref(redirectTo: string): string {
  return `/login?redirect-to=${encodeURIComponent(redirectTo)}`
}
