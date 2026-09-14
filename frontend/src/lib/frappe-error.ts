import type { FrappeError } from "frappe-react-sdk"

/**
 * Human-readable text for a failed Frappe call. `frappe.throw` puts the
 * message in `_server_messages` (JSON list of JSON strings with HTML), and
 * the SDK's `message` is only a generic fallback in that case.
 */
export function frappeErrorMessage(error: FrappeError): string {
  const raw = (error as { _server_messages?: string })._server_messages
  if (raw) {
    try {
      const messages = (JSON.parse(raw) as string[])
        .map((item) => (JSON.parse(item) as { message?: string }).message)
        .filter((text): text is string => Boolean(text))
        .map(stripHtml)
      if (messages.length) return messages.join(" ")
    } catch {
      // Fall through to the generic message.
    }
  }
  return stripHtml(error.message) || "Something went wrong. Try again."
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim()
}
