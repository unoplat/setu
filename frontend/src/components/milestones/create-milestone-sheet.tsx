import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"

import { Sheet, SheetContent } from "@/components/ui/sheet"
import { bindingKey, getBinding, useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import type { Milestone } from "@/lib/milestones"
import { cn } from "@/lib/utils"

import { CreateMilestoneForm } from "./create-milestone-form"
import { DATE_PICKER_POPUP } from "./date-picker"
import { DiscardDraftDialog } from "./discard-draft-dialog"
import {
  createMilestoneFormOptions,
  hasDraft,
  submitOnce,
  useAppForm,
} from "./form"

/** The editor package marks every popup it portals out of the panel. */
function isEditorPopup(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("[data-richtext-portal]")
}

// The panel's two layouts are one shadcn Sheet popup, restyled: a 520px panel
// on the right (06a), or the centred 1120 × 856 writing surface (06b), which
// pins all four edges and centres with auto margins. The `data-[side=right]:`
// prefixes match SheetContent's own classes so they replace them rather than
// compete with them.
const COMPACT_LAYOUT =
  "gap-0 p-7 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]"
const EXPANDED_LAYOUT =
  "gap-0 overflow-hidden rounded-3xl p-0 ring-1 ring-foreground/5 data-[side=right]:left-0 data-[side=right]:m-auto data-[side=right]:h-[min(856px,calc(100dvh-3rem))] data-[side=right]:w-full data-[side=right]:max-w-[calc(100%-2rem)] data-[side=right]:border-s-0 data-[side=right]:sm:max-w-[1120px]"

/**
 * Create Milestone panel (Paper screen 06a), opened from the Milestones page,
 * which is the only place a milestone is created (journey guardrail "Not in
 * the task form").
 */
export function CreateMilestoneSheet({
  open,
  onOpenChange,
  project,
  projectName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Project's name (its id). */
  project: string
  projectName: string
  /** Refresh whatever lists milestones; the panel waits for it. */
  onCreated: (milestone: Milestone) => Promise<unknown>
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false)
  const popup = React.useRef<HTMLDivElement>(null)
  const { call, error, reset } = useFrappePostCall<{ message: Milestone }>(
    "setu.api.milestone.create_milestone"
  )

  // Every caller goes through `submitOnce`, so a create never runs twice at
  // once, and `isSubmitting` keeps the panel from closing until it settles.
  const form = useAppForm({
    ...createMilestoneFormOptions,
    onSubmit: async ({ value }) => {
      // On failure the hook exposes `error`, rendered inside the form.
      const response = await call({
        project,
        subject: value.subject.trim(),
        description: value.description,
        start_date: value.start_date || undefined,
        due_date: value.due_date,
        assignee: value.assignee || undefined,
      }).catch(() => null)
      if (!response) return

      // The milestone exists by now; a failed refresh must not strand the
      // panel on a form that would create it a second time.
      await onCreated(response.message).catch(() => undefined)
      toast.success(`“${response.message.subject}” created`, {
        description: "Tasks can now link to it.",
      })
      close()
    },
    // Mod+Enter on an incomplete form shows what is missing; put the caret
    // on the first field that needs attention.
    onSubmitInvalid: () => {
      requestAnimationFrame(() => {
        popup.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      })
    },
  })
  const submitting = useSelector(form.store, (state) => state.isSubmitting)

  // Closing unmounts the popup, which also drops the editor and its document,
  // so the next open starts from an empty form.
  function close() {
    onOpenChange(false)
    form.reset()
    reset()
    setExpanded(false)
    setConfirmingDiscard(false)
  }

  /** Guardrail "Unsaved draft": ask before losing a title or description. */
  function requestClose() {
    if (hasDraft(form.state.values)) setConfirmingDiscard(true)
    else close()
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
        document.querySelector(
          `[data-richtext-portal], ${DATE_PICKER_POPUP}`
        ) !== null
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [open])

  useScope("create-milestone", open)
  useCommand(
    "createMilestone.toggleDescription",
    () => (expanded ? collapse() : expand()),
    { enabled: open && !submitting && !confirmingDiscard }
  )
  useCommand("createMilestone.collapseDescription", collapse, {
    enabled: open && expanded && !confirmingDiscard,
  })
  // The expanded layout only edits the draft; the milestone is created from
  // the compact one.
  useCommand("createMilestone.submit", () => void submitOnce(form), {
    enabled: open && !expanded && !confirmingDiscard,
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
        // When one of the editor's own popups (link dialog, "/" menu) or a
        // date picker's calendar was open, Escape stays with that popup. They are portalled to <body>,
        // so a press inside one counts as outside too.
        if (
          (details.reason === "escape-key" && popupOpenOnEscape.current) ||
          (details.reason === "outside-press" &&
            isEditorPopup(details.event.target))
        ) {
          return
        }
        // Inside the full editor, Escape and outside clicks return to the
        // form instead of closing it. Base UI stops Escape from propagating
        // out of the panel, so the document-level hotkey for the collapse
        // command never sees it; run the command here while it is bound to
        // Escape.
        if (
          expanded &&
          (details.reason === "escape-key" ||
            details.reason === "outside-press")
        ) {
          if (
            details.reason === "escape-key" &&
            bindingKey(getBinding("createMilestone.collapseDescription")) ===
              "Escape"
          ) {
            collapse()
          }
          return
        }
        requestClose()
      }}
    >
      <SheetContent
        ref={popup}
        side="right"
        showCloseButton={false}
        className={cn(expanded ? EXPANDED_LAYOUT : COMPACT_LAYOUT)}
      >
        <CreateMilestoneForm
          form={form}
          projectName={projectName}
          expanded={expanded}
          error={error ? frappeErrorMessage(error) : null}
          onExpand={expand}
          onCollapse={collapse}
        />
        <DiscardDraftDialog
          open={confirmingDiscard}
          onKeepEditing={() => setConfirmingDiscard(false)}
          onDiscard={close}
        />
      </SheetContent>
    </Sheet>
  )
}
