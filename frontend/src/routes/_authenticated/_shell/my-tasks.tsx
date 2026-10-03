import { createFileRoute } from "@tanstack/react-router"

import { PagePlaceholder } from "@/components/page-placeholder"

// Global, cross-Project view of Tasks assigned to the signed-in user.
export const Route = createFileRoute("/_authenticated/_shell/my-tasks")({
  component: () => <PagePlaceholder title="My tasks" />,
})
