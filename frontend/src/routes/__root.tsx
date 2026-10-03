import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"

import type { AuthState } from "@/lib/auth"

interface RouterContext {
  auth: AuthState
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      {/* URL state for the data tables (src/lib/store/adapters/nuqs). The
          adapter reads and writes through this router, so it sits inside the
          route tree rather than around RouterProvider.
          https://nuqs.dev/docs/adapters#tanstack-router */}
      <NuqsAdapter>
        <Outlet />
      </NuqsAdapter>
      {import.meta.env.DEV ? (
        <TanStackRouterDevtools position="bottom-right" />
      ) : null}
    </>
  )
}
