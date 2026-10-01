import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { useFrappePostCall } from "frappe-react-sdk"

import { DiscardDraftDialog } from "@/components/milestones/discard-draft-dialog"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { bindingKey, getBinding, useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import type { Module } from "@/lib/modules"
import { cn } from "@/lib/utils"

import { CreateModuleForm } from "./create-module-form"
import {
  EMPTY_MODULE,
  createModuleFormOptions,
  hasDraft,
  submitOnce,
  useAppForm,
} from "./form"

/** The editor package marks every popup it portals out of the panel. */
function isEditorPopup(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("[data-richtext-portal]")
}

// The panel's two layouts are one shadcn Sheet popup, restyled, as on the
// Create Milestone panel: a 520px panel on the right (07a), or the centred
// 1120 × 856 writing surface (07b).
const COMPACT_LAYOUT =
  "gap-0 p-7 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]"
const EXPANDED_LAYOUT =
  "gap-0 overflow-hidden rounded-3xl p-0 ring-1 ring-foreground/5 data-[side=right]:left-0 data-[side=right]:m-auto data-[side=right]:h-[min(856px,calc(100dvh-3rem))] data-[side=right]:w-full data-[side=right]:max-w-[calc(100%-2rem)] data-[side=right]:border-s-0 data-[side=right]:sm:max-w-[1120px]"

/**
 * Create Module panel (Paper screen 07a), opened from the Modules page, which
 * is the only place a module is created. It starts on that page's project;
 * the Project field can file the module under another one.
 */
export function CreateModuleSheet({
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
  /**
   * Refresh whatever lists modules and announce it; the panel waits.
   * `project` is where the module went, which may not be this page's.
   */
  onCreated: (module: Module, project: string) => Promise<unknown>
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false)
  const popup = React.useRef<HTMLDivElement>(null)
  const { call, error, reset } = useFrappePostCall<{ message: Module }>(
    "setu.api.module.create_module"
  )

  // Every caller goes through `submitOnce`, so a create never runs twice at
  // once, and `isSubmitting` keeps the panel from closing until it settles.
  const form = useAppForm({
    ...createModuleFormOptions,
    defaultValues: { ...EMPTY_MODULE, project },
    onSubmit: async ({ value }) => {
      // On failure (a duplicate name, say) the hook exposes `error`,
      // rendered inside the form.
      const response = await call({
        project: value.project,
        module_name: value.module_name.trim(),
        description: value.description,
        lead: value.lead || undefined,
      }).catch(() => null)
      if (!response) return

      // The module exists by now; a failed refresh must not strand the panel
      // on a form that would create it a second time.
      await onCreated(response.message, value.project).catch(() => undefined)
      close()
    },
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

  /** Journey guardrail "Unsaved draft": ask before losing a name or text. */
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

  // ProseMirror calls preventDefault() on every Escape, so note whether one
  // of the editor's popups was open before anything reacts to the key.
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

  useScope("create-module", open)
  useCommand(
    "createModule.toggleDescription",
    () => (expanded ? collapse() : expand()),
    { enabled: open && !submitting && !confirmingDiscard }
  )
  useCommand("createModule.collapseDescription", collapse, {
    enabled: open && expanded && !confirmingDiscard,
  })
  // The expanded layout only edits the draft; the module is created from the
  // compact one.
  useCommand("createModule.submit", () => void submitOnce(form), {
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
        // An open editor popup (link dialog, "/" menu) keeps Escape and its
        // own clicks, which land outside the panel since it is portalled.
        if (
          (details.reason === "escape-key" && popupOpenOnEscape.current) ||
          (details.reason === "outside-press" &&
            isEditorPopup(details.event.target))
        ) {
          return
        }
        // Inside the full editor, Escape and outside clicks return to the
        // form instead of closing it. Base UI keeps Escape inside the panel,
        // so run the collapse command here while it is bound to Escape.
        if (
          expanded &&
          (details.reason === "escape-key" ||
            details.reason === "outside-press")
        ) {
          if (
            details.reason === "escape-key" &&
            bindingKey(getBinding("createModule.collapseDescription")) ===
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
        <CreateModuleForm
          form={form}
          project={project}
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
          record="module"
          draft="name and description"
        />
      </SheetContent>
    </Sheet>
  )
}
