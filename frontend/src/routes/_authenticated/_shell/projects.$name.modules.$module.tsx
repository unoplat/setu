import * as React from "react"
import { Navigate, createFileRoute } from "@tanstack/react-router"
import {
  useFrappeGetDoc,
  useFrappePostCall,
  useSWRConfig,
} from "frappe-react-sdk"
import { toast } from "sonner"

import { moduleValues, prepareModule } from "@/components/modules/form"
import { ModuleActions } from "@/components/modules/module-actions"
import {
  ModuleActivityLog,
  ModuleReadOnly,
  ModuleSections,
} from "@/components/modules/module-detail"
import { ModuleForm } from "@/components/modules/module-form"
import { ProjectHeader } from "@/components/project-header"
import { SaveIndicator, UnsavedEditsDialog } from "@/components/record-detail"
import { RecordPlaceholder } from "@/components/record-placeholder"
import { useAutosaveForm } from "@/lib/autosave"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage, frappeExceptionType } from "@/lib/frappe-error"
import {
  moduleActivityKey,
  modulesKey,
  useModule,
  type ModuleDetail,
} from "@/lib/modules"

// Paper: 07d — Module Detail (row clicked): the name, the description, the
// module's tasks and the activity in a centred column, the properties in a
// rail on the right. Every edit saves on its own (lib/autosave); there is no
// Save. Opened from the name in the modules table; the list is
// the sibling index route, so Back returns to it with its filters in the URL.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/modules/$module"
)({
  component: ModulePage,
})

function ModulePage() {
  const { name, module: moduleName } = Route.useParams()
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const { data, error, isLoading, mutate } = useModule(moduleName)
  const module = data?.message
  const projectName = project?.project_name ?? module?.project_name ?? name

  // A module moved to another project (from here, or a link from before the
  // move) opens under the project it is in now.
  if (module && module.project !== name) {
    return (
      <Navigate
        to="/projects/$name/modules/$module"
        params={{ name: module.project, module: module.name }}
        replace
      />
    )
  }

  if (module) {
    // Keyed so another module starts a fresh form, save queue and composer.
    return (
      <ModuleScreen
        key={module.name}
        project={name}
        module={module}
        projectName={projectName}
        replaceModule={(next) =>
          mutate({ message: next }, { revalidate: false })
        }
      />
    )
  }

  return (
    <>
      <ProjectHeader
        name={name}
        projectName={projectName}
        section="Modules"
        page={{ title: moduleName, sectionTo: "/projects/$name/modules" }}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RecordPlaceholder loading={isLoading || (!data && !error)}>
          {error && frappeExceptionType(error) !== "DoesNotExistError"
            ? frappeErrorMessage(error)
            : "This module doesn't exist."}
        </RecordPlaceholder>
      </main>
    </>
  )
}

function ModuleScreen({
  project,
  module,
  projectName,
  replaceModule,
}: {
  project: string
  module: ModuleDetail
  projectName: string
  replaceModule: (next: ModuleDetail) => Promise<unknown>
}) {
  const { mutate: revalidate } = useSWRConfig()
  const [expanded, setExpanded] = React.useState(false)
  const update = useFrappePostCall<{ message: ModuleDetail }>(
    "setu.api.module.update_module"
  )

  // The form starts from the saved module. An edit sends only the fields that
  // differ from it, since the server leaves every field it is not sent alone,
  // so a save here never undoes what someone changed in Desk meanwhile.
  const saved = React.useMemo(() => moduleValues(module), [module])
  const autosave = useAutosaveForm({
    saved,
    prepare: prepareModule,
    save: async (changes) => {
      const response = await update.call({ name: module.name, ...changes })
      const next = response.message
      // A move re-renders this page at the module's new project's URL.
      await replaceModule(next)
      // The lists show the name, summary and lead (and a move takes the row
      // from one to the other); the timeline logs the change.
      void revalidate(modulesKey(project))
      void revalidate(moduleActivityKey(module.name))
      if (next.project !== project) {
        void revalidate(modulesKey(next.project))
        // The one save that changes where the page is, so it says so.
        toast.success(`Moved to ${next.project_name ?? next.project}`)
      }
      return moduleValues(next)
    },
  })
  const { form, flush } = autosave

  const canWrite = module.can_write
  useScope("module")
  useCommand("module.toggleDescription", () => setExpanded((value) => !value), {
    enabled: canWrite,
  })
  useCommand("module.collapseDescription", () => setExpanded(false), {
    enabled: expanded,
  })
  useCommand("module.save", () => void flush(), { enabled: canWrite })

  const footer = <ModuleSections module={module} projectName={projectName} />
  const activity = <ModuleActivityLog module={module} />

  return (
    <>
      <ProjectHeader
        name={project}
        projectName={projectName}
        section="Modules"
        page={{
          title: module.module_name,
          sectionTo: "/projects/$name/modules",
        }}
      >
        <ModuleActions
          project={project}
          module={module}
          canDelete={module.can_write}
        />
      </ProjectHeader>
      <main className="flex min-h-0 flex-1 flex-col">
        {canWrite ? (
          <ModuleForm
            form={form}
            module={module}
            projectName={projectName}
            listeners={autosave.listeners}
            status={autosave.status}
            indicator={
              <SaveIndicator
                status={autosave.status}
                error={autosave.error}
                savedAt={autosave.savedAt}
                onRetry={() => void flush()}
              />
            }
            expanded={expanded}
            onExpand={() => setExpanded(true)}
            onCollapse={() => setExpanded(false)}
            onSubmit={() => void flush()}
            footer={footer}
            activity={activity}
          />
        ) : (
          <ModuleReadOnly
            module={module}
            projectName={projectName}
            footer={footer}
            activity={activity}
          />
        )}
      </main>
      <UnsavedEditsDialog
        leaving={autosave.leaving}
        record={module.module_name}
        reason={autosave.error}
        saving={autosave.status === "saving"}
      />
    </>
  )
}
