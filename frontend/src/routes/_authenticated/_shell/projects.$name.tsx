import { createFileRoute } from "@tanstack/react-router"
import { useFrappeGetDoc } from "frappe-react-sdk"

import { PagePlaceholder } from "@/components/page-placeholder"

// Landing route for a single Project. Screens 02 (Invite members) and 03
// (Board) replace this placeholder.
export const Route = createFileRoute("/_authenticated/_shell/projects/$name")({
  component: ProjectPage,
})

function ProjectPage() {
  const { name } = Route.useParams()
  const { data } = useFrappeGetDoc<{ project_name?: string }>("Project", name)
  return <PagePlaceholder title={data?.project_name ?? name} />
}
