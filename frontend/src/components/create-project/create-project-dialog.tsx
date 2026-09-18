import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { useFrappePostCall } from "frappe-react-sdk"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { useProjects, type ProjectSummary } from "@/lib/projects"
import { cn } from "@/lib/utils"

import { DetailsStep } from "./details-step"
import { ExpandedDescription } from "./expanded-description"
import { createProjectFormOptions, useAppForm } from "./form"
import {
  closeCreateProject,
  openCreateProject,
  useCreateProjectOpen,
} from "./store"

/**
 * Create Project dialog (Paper screen 01). Mounted once in the app shell;
 * open it with `openCreateProject()` or the `project.new` command. The
 * expanded description editor is a second view of the same dialog so the
 * draft never leaves the form.
 */
export function CreateProjectDialog() {
  const open = useCreateProjectOpen()
  const [expanded, setExpanded] = React.useState(false)
  const navigate = useNavigate()
  const { mutate: revalidateProjects } = useProjects()
  const { call, loading, error, reset } = useFrappePostCall<{
    message: ProjectSummary
  }>("setu.api.project.create_project")

  const form = useAppForm({
    ...createProjectFormOptions,
    onSubmit: async ({ value }) => {
      // On failure the hook exposes `error`, rendered inside the form.
      const response = await call({
        project_name: value.details.project_name.trim(),
        description: value.details.description,
      }).catch(() => null)
      if (!response) return

      await revalidateProjects()
      close()
      void navigate({
        to: "/projects/$name",
        params: { name: response.message.name },
      })
    },
  })

  function close() {
    closeCreateProject()
    form.reset()
    reset()
    setExpanded(false)
  }

  useScope("create-project", open)
  useCommand(
    "createProject.toggleDescription",
    () => setExpanded((value) => !value),
    { enabled: open }
  )
  useCommand("createProject.collapseDescription", () => setExpanded(false), {
    enabled: open && expanded,
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          openCreateProject()
          return
        }
        // Escape and outside clicks inside the full editor go back to the
        // form (the collapse command handles Escape); never drop a draft or
        // an in-flight create by accident.
        if (
          (expanded || loading) &&
          (details.reason === "escape-key" ||
            details.reason === "outside-press")
        ) {
          details.cancel()
          return
        }
        close()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "gap-0 rounded-3xl p-7",
          expanded
            ? "flex h-[min(856px,calc(100dvh-3rem))] flex-col overflow-hidden p-0 sm:max-w-[1120px]"
            : "sm:max-w-[520px]"
        )}
      >
        {expanded ? (
          <ExpandedDescription
            form={form}
            onCollapse={() => setExpanded(false)}
          />
        ) : (
          <DetailsStep
            form={form}
            submitting={loading}
            error={error ? frappeErrorMessage(error) : null}
            onExpand={() => setExpanded(true)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
