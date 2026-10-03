import {
  createRouter,
  parseSearchWith,
  stringifySearchWith,
} from "@tanstack/react-router"

import { routeTree } from "./routeTree.gen"

export const router = createRouter({
  routeTree,
  // Frappe serves the app at /envision (setu/www/envision.html + route rule).
  basepath: "/envision",
  // Filled by the `context` prop on RouterProvider (see App.tsx), so the
  // router is created once and not rebuilt on auth changes.
  context: { auth: undefined! },
  defaultPreload: "intent",
  // nuqs owns the search params (data tables, see NuqsAdapter in __root.tsx)
  // and serializes its own values. The router's default JSON-parses anything
  // that looks like JSON, so a title filter of "007" would come back as the
  // number 7. Keep every value the plain string nuqs wrote.
  // https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization
  parseSearch: parseSearchWith((value) => value),
  stringifySearch: stringifySearchWith((value) => JSON.stringify(value)),
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
