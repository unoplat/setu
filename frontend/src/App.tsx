import { useContext, useEffect } from "react"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { RouterProvider } from "@tanstack/react-router"
import { FrappeContext, FrappeProvider, useFrappeAuth } from "frappe-react-sdk"

import { router } from "./router"

declare global {
  interface Window {
    csrf_token?: string
    frappe_site_name?: string
  }
}

// In `vp dev` the Jinja placeholder in index.html is not rendered; drop it so
// the SDK does not send a bogus CSRF header.
if (window.csrf_token?.includes("{{")) window.csrf_token = undefined

const siteName =
  window.frappe_site_name && !window.frappe_site_name.includes("{{")
    ? window.frappe_site_name
    : import.meta.env.VITE_FRAPPE_SITE || window.location.hostname

export function App() {
  // Keep HTTP and sockets same-origin, including the Vite proxy. Without
  // socketPort the SDK redirects pages with a port to :9000 instead.
  return (
    <FrappeProvider
      enableSocket
      siteName={siteName}
      socketPort={window.location.port || undefined}
    >
      {/* Command bindings (src/lib/commands) are registered through TanStack
          Hotkeys; the provider only sets shared defaults. */}
      <HotkeysProvider defaultOptions={{ hotkeySequence: { timeout: 1500 } }}>
        <RouterWithAuth />
      </HotkeysProvider>
    </FrappeProvider>
  )
}

function RouterWithAuth() {
  // The SDK checks the session once and never again by default. Re-check on
  // window focus so a session that ended elsewhere clears `currentUser` and
  // the next navigation hits the login redirect in `_authenticated`.
  const { currentUser, isLoading } = useFrappeAuth({ revalidateOnFocus: true })
  const socket = useContext(FrappeContext)?.socket
  useEffect(() => {
    if (isLoading || !socket) return
    if (currentUser) socket.connect()
    else socket.disconnect()
    // Re-authenticate the socket when the signed-in identity changes.
    return () => {
      socket.disconnect()
    }
  }, [socket, currentUser, isLoading])
  // Wait for the session check so `beforeLoad` guards see the real state.
  if (isLoading) return null
  return (
    <RouterProvider
      router={router}
      context={{ auth: { currentUser: currentUser ?? null } }}
    />
  )
}
