import { createFileRoute } from "@tanstack/react-router"

import { PagePlaceholder } from "@/components/page-placeholder"

// Personal stream of Project activity. Record basis is still undecided
// (CONTEXT.md), so this is navigation only for now.
export const Route = createFileRoute("/_authenticated/_shell/inbox")({
  component: () => <PagePlaceholder title="Inbox" />,
})
