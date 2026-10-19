import { createFileRoute } from "@tanstack/react-router"

import { InboxPage } from "@/components/inbox/inbox-page"

// The Inbox (Paper 10c): the signed-in user's assignments and mentions across
// Projects. Its records are Frappe's Notification Log rows on Envision
// records, read through setu/api/inbox.py (lib/inbox.ts).
export const Route = createFileRoute("/_authenticated/_shell/inbox")({
  component: InboxPage,
})
