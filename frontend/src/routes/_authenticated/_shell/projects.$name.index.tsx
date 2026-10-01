import { createFileRoute } from "@tanstack/react-router"

import { ProjectBoard } from "@/components/tasks/project-board"

// The Tasks section, and a Project's landing route: the Board with every
// Task, "All tasks" (components/tasks/project-board.tsx).
export const Route = createFileRoute("/_authenticated/_shell/projects/$name/")({
  component: ProjectTasksPage,
})

function ProjectTasksPage() {
  const { name } = Route.useParams()
  return <ProjectBoard project={name} />
}
