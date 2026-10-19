import { createFileRoute } from "@tanstack/react-router"

import { ProjectBoard } from "@/components/tasks/project-board"
import { useMarkRecordRead } from "@/lib/inbox"

// The Tasks section, and a Project's landing route: the Board with every
// Task, "All tasks" (components/tasks/project-board.tsx).
export const Route = createFileRoute("/_authenticated/_shell/projects/$name/")({
  component: ProjectTasksPage,
})

function ProjectTasksPage() {
  const { name } = Route.useParams()
  // Opening it marks its Inbox items read (lib/inbox.ts).
  useMarkRecordRead("project", name)
  return <ProjectBoard project={name} />
}
