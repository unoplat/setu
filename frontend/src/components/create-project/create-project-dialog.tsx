import * as React from "react"
import { useStore } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { useFrappePostCall } from "frappe-react-sdk"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { bindingKey, getBinding, useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { useProjects, type ProjectSummary } from "@/lib/projects"
import { cn } from "@/lib/utils"

import { CreateProjectForm } from "./create-project-form"
import { createProjectFormOptions, useAppForm } from "./form"
import {
  closeCreateProject,
  openCreateProject,
  useCreateProjectOpen,
} from "./store"

/** The editor package marks every popup it portals out of the dialog. */
function isEditorPopup(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("[data-richtext-portal]")
}

/**
 * Create Project dialog (Paper screen 01). Mounted once in the app shell;
 * open it with `openCreateProject()` or the `project.new` command. The
 * expanded description editor is a second layout of the same form, so the
 * draft never leaves it.
 */
export function CreateProjectDialog() {
  const open = useCreateProjectOpen()
  const [expanded, setExpanded] = React.useState(false)
  const popup = React.useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { mutate: revalidateProjects } = useProjects()
  const { call, error, reset } = useFrappePostCall<{
    message: ProjectSummary
  }>("setu.api.project.create_project")

  const form = useAppForm({
    ...createProjectFormOptions,
    // Every caller goes through `submitOnce`, so this never runs twice at
    // once. `isSubmitting` holds until it settles, so the dialog stays shut to
    // closing through the create call and the revalidation after it.
    onSubmit: async ({ value }) => {
      // On failure the hook exposes `error`, rendered inside the form.
      const response = await call({
        project_name: value.project_name.trim(),
        description: value.description,
      }).catch(() => null)
      if (!response) return

      // The project exists by now; a failed refresh must not strand the
      // dialog on a form that would create it a second time.
      await revalidateProjects().catch(() => undefined)
      close()
      void navigate({
        to: "/projects/$name",
        params: { name: response.message.name },
      })
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  function close() {
    closeCreateProject()
    form.reset()
    reset()
    setExpanded(false)
  }

  function setLayout(next: boolean) {
    // Unmounting the focused button makes Base UI restore focus to the popup
    // on the next frame, which would steal it back from the editor. Park
    // focus on the popup first, unless it is already in the editor.
    if (!popup.current?.querySelector(".ProseMirror:focus")) {
      popup.current?.focus()
    }
    setExpanded(next)
  }
  const expand = () => setLayout(true)
  const collapse = () => setLayout(false)

  // ProseMirror calls preventDefault() on every Escape, so `defaultPrevented`
  // cannot tell "a popup handled it" from "the caret was in the editor". The
  // popups tear themselves down during the same keydown, so note whether one
  // was open before anything reacts to the key.
  const popupOpenOnEscape = React.useRef(false)
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      popupOpenOnEscape.current =
        document.querySelector("[data-richtext-portal]") !== null
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [open])

  useScope("create-project", open)
  useCommand(
    "createProject.toggleDescription",
    () => (expanded ? collapse() : expand()),
    { enabled: open && !submitting }
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
        if (submitting) {
          details.cancel()
          return
        }
        // When one of the editor's own popups (link dialog, "/" menu) was
        // open, Escape stays with that popup. They are portalled to <body>,
        // so a press inside one counts as outside too.
        if (
          (details.reason === "escape-key" && popupOpenOnEscape.current) ||
          (details.reason === "outside-press" &&
            isEditorPopup(details.event.target))
        ) {
          details.cancel()
          return
        }
        // Inside the full editor, Escape and outside clicks must not discard
        // the draft. Base UI stops Escape from propagating out of the dialog,
        // so the document-level hotkey for the collapse command never sees
        // it; run the command here while it is bound to Escape.
        if (
          expanded &&
          (details.reason === "escape-key" ||
            details.reason === "outside-press")
        ) {
          details.cancel()
          if (
            details.reason === "escape-key" &&
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
        <CreateProjectForm
          form={form}
          expanded={expanded}
          error={error ? frappeErrorMessage(error) : null}
          onExpand={expand}
          onCollapse={collapse}
        />
      </DialogContent>
    </Dialog>
  )
}
