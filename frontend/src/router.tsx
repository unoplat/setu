import { createRouter } from "@tanstack/react-router"

import { routeTree } from "./routeTree.gen"

export const router = createRouter({
  routeTree,
  // Frappe serves the app at /envision (setu/www/envision.html + route rule).
  basepath: "/envision",
  // Filled by the `context` prop on RouterProvider (see App.tsx), so the
  // router is created once and not rebuilt on auth changes.
  context: { auth: undefined! },
  defaultPreload: "intent",
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
