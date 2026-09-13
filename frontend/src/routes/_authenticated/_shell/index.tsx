import { createFileRoute } from "@tanstack/react-router"
import { LayoutGridIcon, PlusIcon } from "lucide-react"

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

// Paper: "00 — Empty Projects" (Home Page). The Projects landing screen.
export const Route = createFileRoute("/_authenticated/_shell/")({
  component: ProjectsPage,
})

function ProjectsPage() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-sm font-medium">Projects</h1>
        </div>
        <Button variant="outline" size="sm">
          <PlusIcon />
          New project
        </Button>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-lg">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutGridIcon />
            </EmptyMedia>
            <EmptyTitle className="text-3xl font-semibold tracking-tight">
              No projects yet
            </EmptyTitle>
            <EmptyDescription className="text-base">
              Create a project to bring tasks, milestones, and team updates into
              one shared workspace.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="lg">
              <PlusIcon />
              Create project
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    </>
  )
}
