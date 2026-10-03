import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useFrappeGetDoc, useSWRConfig } from "frappe-react-sdk"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { CreateModuleSheet } from "@/components/modules/create-module-sheet"
import { ModuleTable } from "@/components/modules/module-table"
import { ModulesEmpty } from "@/components/modules/modules-empty"
import { ProjectHeader } from "@/components/project-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { modulesKey, useModules, type Module } from "@/lib/modules"
import { useProjects } from "@/lib/projects"

// Paper: 07 — Empty Modules, the Create Module panel (07a/07b) from the
// "Create module journey", and 07c — the table of existing modules.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/modules/"
)({
  component: ModulesPage,
})

function ModulesPage() {
  const { name } = Route.useParams()
  const navigate = Route.useNavigate()
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const projectName = project?.project_name ?? name
  const { data, error, isLoading, mutate } = useModules(name)
  const { mutate: revalidate } = useSWRConfig()
  const { data: projects } = useProjects()
  const [creating, setCreating] = React.useState(false)
  // 07c: the module this visit created wears "New" until the page is left.
  const [created, setCreated] = React.useState<string | null>(null)
  const modules = data?.message

  async function onCreated(module: Module, project: string) {
    const here = project === name
    // It exists either way; a failed refresh still announces it.
    if (here) {
      await mutate().catch(() => undefined)
      setCreated(module.name)
    } else {
      void revalidate(modulesKey(project))
    }
    const where = here
      ? ""
      : ` in ${projects?.find((item) => item.name === project)?.project_name ?? project}`
    toast.success(`“${module.module_name}” created${where}`, {
      description: "Open it to describe the area in full.",
      action: {
        label: "Open",
        onClick: () =>
          void navigate({
            to: "/projects/$name/modules/$module",
            params: { name: project, module: module.name },
          }),
      },
    })
  }

  return (
    <>
      <ProjectHeader name={name} projectName={projectName} section="Modules">
        <Button
          className="h-9 px-3.5 font-semibold"
          onClick={() => setCreating(true)}
        >
          <PlusIcon data-icon="inline-start" />
          New module
        </Button>
      </ProjectHeader>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {isLoading || (!modules && !error) ? (
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 sm:px-12 sm:py-12">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-80" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : error || !modules ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {error ? frappeErrorMessage(error) : "Modules could not be loaded."}
          </div>
        ) : modules.length === 0 ? (
          <ModulesEmpty
            projectName={projectName}
            onCreate={() => setCreating(true)}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-12 sm:py-12">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Modules</h1>
              <p className="text-sm text-muted-foreground">
                The lasting parts of {projectName} and who leads each one.
              </p>
            </div>
            <ModuleTable modules={modules} created={created} />
          </div>
        )}
      </main>
      {/* Keyed so another project's page starts the draft on that project. */}
      <CreateModuleSheet
        key={name}
        open={creating}
        onOpenChange={setCreating}
        project={name}
        projectName={projectName}
        onCreated={onCreated}
      />
    </>
  )
}
