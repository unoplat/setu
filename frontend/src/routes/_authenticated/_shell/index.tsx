import { createFileRoute, Link } from "@tanstack/react-router"
import { FolderIcon, LayoutGridIcon, PlusIcon } from "lucide-react"

import { CreateProjectDialog } from "@/components/create-project-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useProjects } from "@/lib/projects"

// Paper: "00 — Empty Projects" (Home Page). The Projects landing screen.
export const Route = createFileRoute("/_authenticated/_shell/")({
  component: ProjectsPage,
})

function ProjectsPage() {
  const { data: projects, isLoading } = useProjects()
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-sm font-medium">Projects</h1>
        </div>
        <CreateProjectDialog
          trigger={
            <Button variant="outline" size="sm">
              <PlusIcon />
              New project
            </Button>
          }
        />
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        {isLoading ? null : projects?.length ? (
          <ProjectList projects={projects} />
        ) : (
          <Empty className="max-w-lg">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGridIcon />
              </EmptyMedia>
              <EmptyTitle className="text-3xl font-semibold tracking-tight">
                No projects yet
              </EmptyTitle>
              <EmptyDescription className="text-base">
                Create a project to bring tasks, milestones, and team updates
                into one shared workspace.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <CreateProjectDialog
                trigger={
                  <Button size="lg">
                    <PlusIcon />
                    Create project
                  </Button>
                }
              />
            </EmptyContent>
          </Empty>
        )}
      </main>
    </>
  )
}

// Interim list until the populated Projects screen is designed.
function ProjectList({
  projects,
}: {
  projects: readonly { name: string; project_name: string }[]
}) {
  return (
    <ul className="grid w-full max-w-lg gap-1 self-start">
      {projects.map((project) => (
        <li key={project.name}>
          <Link
            to="/projects/$name"
            params={{ name: project.name }}
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <FolderIcon className="size-4 text-muted-foreground" />
            {project.project_name}
          </Link>
        </li>
      ))}
    </ul>
  )
}
