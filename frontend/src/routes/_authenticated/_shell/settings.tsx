import { createFileRoute } from "@tanstack/react-router"

import { PagePlaceholder } from "@/components/page-placeholder"

// Global application settings (Project-scoped settings live under a Project).
export const Route = createFileRoute("/_authenticated/_shell/settings")({
  component: () => <PagePlaceholder title="Settings" />,
})
