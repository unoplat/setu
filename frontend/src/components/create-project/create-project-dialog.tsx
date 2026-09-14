import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { useFrappePostCall } from "frappe-react-sdk"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { useProjects, type CreatedProject } from "@/lib/projects"
import { cn } from "@/lib/utils"

import { DetailsStep } from "./details-step"
import { ExpandedDescription } from "./expanded-description"
import { createProjectFormOptions, useAppForm } from "./form"
import { MembersStep } from "./members-step"
import {
  closeCreateProject,
  openCreateProject,
  useCreateProjectOpen,
} from "./store"

type Step = "details" | "members"

/**
 * Create Project wizard (Paper screens 01 and 02): details, then members.
 * Mounted once in the app shell; open it with `openCreateProject()` or the
 * `project.new` command. The expanded description editor is a third view of
 * the same dialog so the draft never leaves the form.
 */
export function CreateProjectDialog() {
  const open = useCreateProjectOpen()
  const [step, setStep] = React.useState<Step>("details")
  const [expanded, setExpanded] = React.useState(false)
  const navigate = useNavigate()
  const { mutate: revalidateProjects } = useProjects()
  const { call, loading, error, reset } = useFrappePostCall<{
    message: CreatedProject
  }>("setu.api.project.create_project")

  const form = useAppForm({
    ...createProjectFormOptions,
    onSubmit: async ({ value }) => {
      // On failure the hook exposes `error`, rendered inside the members step.
      const response = await call({
        project_name: value.details.project_name.trim(),
        description: value.details.description,
        members: value.members.users,
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
    setStep("details")
    setExpanded(false)
  }

  useScope("create-project", open)
  useCommand(
    "createProject.toggleDescription",
    () => setExpanded((value) => !value),
    { enabled: open && step === "details" }
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
            : step === "details"
              ? "sm:max-w-[520px]"
              : "sm:max-w-[600px]"
        )}
      >
        {expanded ? (
          <ExpandedDescription
            form={form}
            onCollapse={() => setExpanded(false)}
          />
        ) : step === "details" ? (
          <DetailsStep
            form={form}
            onNext={() => setStep("members")}
            onExpand={() => setExpanded(true)}
          />
        ) : (
          <MembersStep
            form={form}
            projectName={form.getFieldValue("details.project_name").trim()}
            submitting={loading}
            error={error ? frappeErrorMessage(error) : null}
            onSkip={() => {
              form.setFieldValue("members.users", [])
              void form.handleSubmit()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
