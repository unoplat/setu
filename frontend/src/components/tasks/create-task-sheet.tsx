import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"

import { DATE_PICKER_POPUP } from "@/components/milestones/date-picker"
import { DiscardDraftDialog } from "@/components/milestones/discard-draft-dialog"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import type { CreateStatus } from "@/lib/tasks"

import { CreateTaskForm } from "./create-task-form"
import {
  EMPTY_TASK,
  createTaskFormOptions,
  hasDraft,
  submitOnce,
  useAppForm,
} from "./form"

/** The editor package marks every popup it portals out of the panel. */
function isEditorPopup(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("[data-richtext-portal]")
}

/** A popup portalled to <body> that owns clicks and Escape while open. */
const OWN_POPUPS = `[data-richtext-portal], ${DATE_PICKER_POPUP}`

/**
 * Create Task panel (Paper screen 03), opened from a Board column's "+" (its
 * Status picked), from a section's "+" (its Status and Module picked), or from
 * a milestone's or module's page (that link picked). Like
 * Create Milestone, a 520px panel on the right that asks before dropping a
 * draft.
 */
export function CreateTaskSheet({
  open,
  onOpenChange,
  project,
  projectName,
  status,
  module,
  milestone,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Project's name (its id). */
  project: string
  projectName: string
  /** The Status of the column the panel was opened from. */
  status: CreateStatus
  /**
   * The Module of the section the panel was opened from; "" or absent for
   * none.
   */
  module?: string
  /** The milestone whose page the panel was opened from, if any. */
  milestone?: string
  /** Refresh the Board; the panel waits for it. */
  onCreated: () => Promise<unknown>
}) {
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false)
  const popup = React.useRef<HTMLDivElement>(null)
  const { call, error, reset } = useFrappePostCall<{
    message: { name: string; subject: string; status: string }
  }>("setu.api.task.create_task")

  const form = useAppForm({
    ...createTaskFormOptions,
    onSubmit: async ({ value }) => {
      // On failure the hook exposes `error`, rendered inside the form.
      const response = await call({
        project,
        subject: value.subject.trim(),
        description: value.description,
        start_date: value.start_date || undefined,
        due_date: value.due_date || undefined,
        status: value.status,
        priority: value.priority,
        assignee: value.assignee || undefined,
        milestone: value.milestone || undefined,
        module: value.module || undefined,
        tags: value.tags,
      }).catch(() => null)
      if (!response) return

      // The Task exists by now; a failed refresh must not strand the panel
      // on a form that would create it a second time.
      await onCreated().catch(() => undefined)
      toast.success(`“${response.message.subject}” created`, {
        description: response.message.name,
      })
      close()
    },
    // Mod+Enter without a title shows what is missing; put the caret there.
    onSubmitInvalid: () => {
      requestAnimationFrame(() => {
        popup.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      })
    },
  })
  const submitting = useSelector(form.store, (state) => state.isSubmitting)

  // Each open starts from an empty form in the column's Status. Before paint,
  // so the Status field never shows the previous column's.
  React.useLayoutEffect(() => {
    if (open) {
      form.reset({
        ...EMPTY_TASK,
        status,
        module: module ?? "",
        milestone: milestone ?? "",
      })
    }
  }, [open, status, module, milestone, form])

  function close() {
    onOpenChange(false)
    reset()
    setConfirmingDiscard(false)
  }

  /** Guardrail "Unsaved draft": ask before losing a title or description. */
  function requestClose() {
    if (hasDraft(form.state.values)) setConfirmingDiscard(true)
    else close()
  }

  // ProseMirror calls preventDefault() on every Escape, so note whether one
  // of the editor's or the date picker's popups was open before anything
  // reacts to the key; that Escape belongs to the popup.
  const popupOpenOnEscape = React.useRef(false)
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      popupOpenOnEscape.current = document.querySelector(OWN_POPUPS) !== null
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [open])

  useScope("create-task", open)
  useCommand("createTask.submit", () => void submitOnce(form), {
    enabled: open && !confirmingDiscard,
  })

  return (
    <Sheet
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          onOpenChange(true)
          return
        }
        details.cancel()
        // Never drop an in-flight create, whatever asked for the close.
        if (submitting) return
        if (
          (details.reason === "escape-key" && popupOpenOnEscape.current) ||
          (details.reason === "outside-press" &&
            isEditorPopup(details.event.target))
        ) {
          return
        }
        requestClose()
      }}
    >
      <SheetContent
        ref={popup}
        side="right"
        showCloseButton={false}
        className="gap-0 p-7 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]"
      >
        <CreateTaskForm
          form={form}
          project={project}
          projectName={projectName}
          error={error ? frappeErrorMessage(error) : null}
        />
        <DiscardDraftDialog
          open={confirmingDiscard}
          onKeepEditing={() => setConfirmingDiscard(false)}
          onDiscard={close}
          record="task"
        />
      </SheetContent>
    </Sheet>
  )
}
