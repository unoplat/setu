import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { useFrappePostCall } from "frappe-react-sdk"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { bindingKey, getBinding, useCommand, useScope } from "@/lib/commands"
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
  // Which field takes focus when the compact form mounts: the name on open,
  // the description when coming back from the full editor.
  const [focusField, setFocusField] = React.useState<"name" | "description">(
    "name"
  )
  const inFlight = React.useRef(false)
  const popup = React.useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { mutate: revalidateProjects } = useProjects()
  const { call, loading, error, reset } = useFrappePostCall<{
    message: ProjectSummary
  }>("setu.api.project.create_project")

  const form = useAppForm({
    ...createProjectFormOptions,
    onSubmit: async ({ value }) => {
      // `handleSubmit` does not refuse a second call while the first is in
      // flight (Mod+Enter twice, or Enter then Mod+Enter), and the submit
      // button's `disabled` only covers clicks.
      if (inFlight.current) return
      inFlight.current = true
      // On failure the hook exposes `error`, rendered inside the form.
      const response = await call({
        project_name: value.details.project_name.trim(),
        description: value.details.description,
      })
        .catch(() => null)
        .finally(() => {
          inFlight.current = false
        })
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
    setFocusField("name")
  }

  function expand() {
    // Unmounting the focused field makes Base UI restore focus to the popup
    // on the next frame, which would steal it back from the editor. Park
    // focus on the popup first so nothing is lost and nothing is restored.
    popup.current?.focus()
    setExpanded(true)
  }

  function collapse() {
    setExpanded(false)
    setFocusField("description")
  }

  useScope("create-project", open)
  useCommand(
    "createProject.toggleDescription",
    () => (expanded ? collapse() : expand()),
    { enabled: open && !loading }
  )
  useCommand("createProject.collapseDescription", collapse, {
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
        // Never drop an in-flight create, whatever asked for the close.
        if (loading) {
          details.cancel()
          return
        }
        // Inside the full editor, Escape and outside clicks must not discard
        // the draft. Base UI stops Escape from propagating out of the dialog,
        // so the document-level hotkey for the collapse command never sees
        // it; run the command here while it is bound to Escape. When one of
        // the editor's own popups (link dialog, block type menu) has already
        // handled the key, it stays with that popup.
        if (
          expanded &&
          (details.reason === "escape-key" ||
            details.reason === "outside-press")
        ) {
          details.cancel()
          if (
            details.reason === "escape-key" &&
            !details.event.defaultPrevented &&
            bindingKey(getBinding("createProject.collapseDescription")) ===
              "Escape"
          ) {
            collapse()
          }
          return
        }
        close()
      }}
    >
      <DialogContent
        ref={popup}
        showCloseButton={false}
        className={cn(
          "gap-0 rounded-3xl p-7",
          expanded
            ? "flex h-[min(856px,calc(100dvh-3rem))] flex-col overflow-hidden p-0 sm:max-w-[1120px]"
            : "sm:max-w-[520px]"
        )}
      >
        {expanded ? (
          <ExpandedDescription form={form} onCollapse={collapse} />
        ) : (
          <DetailsStep
            form={form}
            submitting={loading}
            focusField={focusField}
            error={error ? frappeErrorMessage(error) : null}
            onExpand={expand}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
