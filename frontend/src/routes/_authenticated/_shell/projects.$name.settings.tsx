import * as React from "react"
import { useStore } from "@tanstack/react-form"
import {
  createFileRoute,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"

import { ProjectHeader } from "@/components/project-header"
import { DangerZone } from "@/components/project-settings/danger-zone"
import {
  DeleteProjectDialog,
  type DeleteDialogKind,
} from "@/components/project-settings/delete-project-dialog"
import {
  deleteDialogFor,
  saveState,
  settingsValues,
  submitOnce,
  useAppForm,
} from "@/components/project-settings/form"
import { ProjectSettingsForm } from "@/components/project-settings/project-settings-form"
import { UnsavedChangesDialog } from "@/components/project-settings/unsaved-changes-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage, frappeExceptionType } from "@/lib/frappe-error"
import {
  useProjectSettings,
  type ProjectSettings,
} from "@/lib/project-settings"
import { useProjects } from "@/lib/projects"

// Paper: 05 — Project Settings, with 05a/05b (delete) and the "Project
// settings journey" guardrails. Application settings live at /settings.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/settings"
)({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { name } = Route.useParams()
  const { data, error, isLoading, mutate } = useProjectSettings(name)

  if (isLoading || (!data && !error)) {
    return (
      <>
        <ProjectHeader name={name} projectName={name} section="Settings" />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-8 sm:px-16 sm:py-12">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-5 w-96" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </main>
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        <ProjectHeader name={name} projectName={name} section="Settings" />
        <main className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {error
            ? frappeErrorMessage(error)
            : "This project could not be loaded."}
        </main>
      </>
    )
  }

  // Keyed so switching projects starts a fresh form, blocker and dialogs.
  return (
    <ProjectSettingsScreen
      key={data.message.name}
      settings={data.message}
      replaceSettings={(next) =>
        mutate({ message: next }, { revalidate: false })
      }
      revalidateSettings={() => mutate()}
    />
  )
}

function ProjectSettingsScreen({
  settings,
  replaceSettings,
  revalidateSettings,
}: {
  settings: ProjectSettings
  replaceSettings: (next: ProjectSettings) => Promise<unknown>
  revalidateSettings: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const { mutate: revalidateProjects } = useProjects()
  const [expanded, setExpanded] = React.useState(false)
  const [deleteDialog, setDeleteDialog] = React.useState<DeleteDialogKind>(null)

  const update = useFrappePostCall<{ message: ProjectSettings }>(
    "setu.api.project.update_project"
  )
  const remove = useFrappePostCall<{
    message: { name: string; project_name: string }
  }>("setu.api.project.delete_project")

  // Defaults are the saved values; a save resets them to what the server
  // kept (Frappe cleans the description HTML), so "unsaved changes" is just
  // the form no longer matching its defaults.
  const defaultValues = React.useMemo(
    () => settingsValues(settings),
    [settings]
  )
  // Every caller goes through `submitOnce`, so a save never runs twice at once.
  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const response = await update
        .call({
          name: settings.name,
          project_name: value.project_name.trim(),
          description: value.description,
        })
        .catch(() => null)
      if (!response) return
      form.reset(settingsValues(response.message))
      // A new name shows in the sidebar and breadcrumb right away.
      await Promise.all([
        replaceSettings(response.message),
        revalidateProjects().catch(() => undefined),
      ])
      toast.success("Changes saved")
    },
  })
  const submitting = useStore(form.store, (s) => s.isSubmitting)
  const dirty = useStore(form.store, (s) => !s.isDefaultValue)
  const projectName = useStore(form.store, (s) => s.values.project_name)
  const state = saveState({ dirty, projectName, submitting })

  // Leaving with edits asks first (journey: "Nothing saves silently").
  // Refs so the blocker always sees the latest state, and so a project that
  // was just deleted can be left without a prompt.
  const dirtyRef = React.useRef(false)
  const leaving = React.useRef(false)
  React.useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  const shouldBlock = () => dirtyRef.current && !leaving.current
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock,
    enableBeforeUnload: shouldBlock,
    withResolver: true,
  })

  async function saveAndLeave() {
    await submitOnce(form)
    if (form.state.isDefaultValue) blocker.proceed?.()
  }

  useScope("project-settings")
  useCommand(
    "projectSettings.toggleDescription",
    () => setExpanded((value) => !value),
    { enabled: !submitting && deleteDialog === null }
  )
  useCommand("projectSettings.collapseDescription", () => setExpanded(false), {
    enabled: expanded,
  })
  useCommand("projectSettings.save", () => void submitOnce(form), {
    enabled: state === "dirty",
  })

  async function confirmDelete() {
    // `remove.error` is this render's value, still null here, so keep the
    // error the call rejected with.
    let failure: unknown = null
    const response = await remove
      .call({ name: settings.name })
      .catch((error: unknown) => {
        failure = error
        return null
      })
    if (!response) {
      // Tasks were added since the page loaded: show the refusal instead.
      if (frappeExceptionType(failure) === "ProjectHasTasksError") {
        setDeleteDialog("refused")
        void revalidateSettings()
      }
      return
    }
    leaving.current = true
    setDeleteDialog(null)
    await revalidateProjects().catch(() => undefined)
    toast(`“${response.message.project_name}” deleted`)
    void navigate({ to: "/" })
  }

  return (
    <>
      <ProjectHeader
        name={settings.name}
        projectName={settings.project_name}
        section="Settings"
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-8 sm:px-16 sm:py-12">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Project settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage how {settings.project_name} appears to everyone in
              Envision.
            </p>
          </div>
          <ProjectSettingsForm
            form={form}
            projectName={settings.project_name}
            state={state}
            expanded={expanded}
            error={update.error ? frappeErrorMessage(update.error) : null}
            onExpand={() => setExpanded(true)}
            onCollapse={() => setExpanded(false)}
          />
          {settings.can_delete ? (
            <DangerZone
              projectName={settings.project_name}
              onDelete={() => {
                remove.reset()
                setDeleteDialog(deleteDialogFor(settings))
              }}
            />
          ) : null}
        </div>
      </main>
      <DeleteProjectDialog
        kind={deleteDialog}
        projectName={settings.project_name}
        deleting={remove.loading}
        error={
          remove.error &&
          frappeExceptionType(remove.error) !== "ProjectHasTasksError"
            ? frappeErrorMessage(remove.error)
            : null
        }
        onCancel={() => setDeleteDialog(null)}
        onConfirm={() => void confirmDelete()}
        onOpenTasks={() => {
          setDeleteDialog(null)
          void navigate({
            to: "/projects/$name",
            params: { name: settings.name },
          })
        }}
      />
      <UnsavedChangesDialog
        open={blocker.status === "blocked"}
        projectName={settings.project_name}
        saving={submitting}
        onKeepEditing={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
        onSave={() => void saveAndLeave()}
      />
    </>
  )
}
