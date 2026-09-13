import { createFileRoute, redirect } from "@tanstack/react-router"

import { frappeLoginHref } from "@/lib/auth"

// Pathless layout: every route under `_authenticated/` requires a Frappe
// session. Guests are sent to Frappe's login page and returned afterwards.
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.currentUser) {
      throw redirect({ href: frappeLoginHref(location.href) })
    }
  },
})
