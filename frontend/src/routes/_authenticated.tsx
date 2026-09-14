import { createFileRoute, redirect } from "@tanstack/react-router"

import { frappeLoginHref } from "@/lib/auth"

// Pathless layout: every route under `_authenticated/` requires a Frappe
// session. Guests are sent to Frappe's login page and returned afterwards.
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.currentUser) {
      // `/login` is a Frappe page, not a router route. Without
      // `reloadDocument` a relative href is treated as in-app navigation and
      // the basepath rewrite turns it into /envision/login (Not Found).
      // `publicHref` keeps the /envision basepath that `href` strips, so
      // Frappe returns to the real URL after sign-in.
      throw redirect({
        href: frappeLoginHref(location.publicHref),
        reloadDocument: true,
      })
    }
  },
})
