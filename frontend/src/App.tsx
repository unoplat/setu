import { RouterProvider } from "@tanstack/react-router"
import { FrappeProvider, useFrappeAuth } from "frappe-react-sdk"

import { router } from "./router"

declare global {
  interface Window {
    csrf_token?: string
  }
}

// In `vp dev` the Jinja placeholder in index.html is not rendered; drop it so
// the SDK does not send a bogus CSRF header.
if (window.csrf_token?.includes("{{")) window.csrf_token = undefined

export function App() {
  // Same-origin in both dev (Vite proxy) and prod (served by Frappe), so no
  // `url` prop. Socket is off until realtime is needed.
  return (
    <FrappeProvider enableSocket={false}>
      <RouterWithAuth />
    </FrappeProvider>
  )
}

function RouterWithAuth() {
  const { currentUser, isLoading } = useFrappeAuth()
  // Wait for the session check so `beforeLoad` guards see the real state.
  if (isLoading) return null
  return (
    <RouterProvider
      router={router}
      context={{ auth: { currentUser: currentUser ?? null } }}
    />
  )
}
