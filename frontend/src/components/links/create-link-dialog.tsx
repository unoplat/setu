import * as React from "react"
import { useSelector } from "@tanstack/react-form"

import { DiscardDraftDialog } from "@/components/milestones/discard-draft-dialog"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { bindingKey, getBinding, useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  normalizeUrl,
  useCreateLink,
  useLinkTypes,
  type LinkSummary,
} from "@/lib/links"
import { cn } from "@/lib/utils"

import { CreateLinkForm, effectiveLinkType } from "./create-link-form"
import {
  EMPTY_LINK,
  createLinkFormOptions,
  hasDraft,
  submitOnce,
  useAppForm,
} from "./form"

/** The editor package marks every popup it portals out of the dialog. */
function isEditorPopup(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("[data-richtext-portal]")
}

/**
 * Add link (Paper: Links 02), opened from the Links board, the only place a
 * link is added. Paper draws it as a centred dialog rather than the Create
 * Module side panel; everything inside works the same way: TanStack Form owns
 * the draft, `submitOnce` sends it, the panel waits for `onCreated`, and a
 * draft is never dropped without asking.
 */
export function CreateLinkDialog({
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
  /** Refresh the board and announce it; the dialog waits. */
  onCreated: (link: LinkSummary) => Promise<unknown>
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false)
  const [creatingType, setCreatingType] = React.useState(false)
  const popup = React.useRef<HTMLDivElement>(null)
  const { call, error, reset } = useCreateLink()
  const types = useLinkTypes()
  const typesRef = React.useRef(types.data?.message)
  React.useEffect(() => {
    typesRef.current = types.data?.message
  })

  const form = useAppForm({
    ...createLinkFormOptions,
    defaultValues: { ...EMPTY_LINK, project },
    onSubmit: async ({ value }) => {
      const linkType = effectiveLinkType(
        value.link_type,
        value.url,
        typesRef.current
      )
      // On failure the hook exposes `error`, rendered inside the form.
      const response = await call({
        project,
        link_name: value.link_name.trim(),
        url: normalizeUrl(value.url),
        link_type: linkType,
        description: value.description || undefined,
      }).catch(() => null)
      if (!response) return

      // The link exists by now; a failed refresh must not strand the dialog
      // on a form that would add it a second time.
      await onCreated(response.message).catch(() => undefined)
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

  function close() {
    onOpenChange(false)
    form.reset()
    reset()
    setExpanded(false)
    setCreatingType(false)
    setConfirmingDiscard(false)
  }

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

  useScope("create-link", open)
  useCommand(
    "createLink.toggleDescription",
    () => (expanded ? collapse() : expand()),
    { enabled: open && !submitting && !confirmingDiscard }
  )
  useCommand("createLink.collapseDescription", collapse, {
    enabled: open && expanded && !confirmingDiscard,
  })
  // The expanded layout only edits the draft; the link is added from the
  // compact one.
  useCommand("createLink.submit", () => void submitOnce(form), {
    enabled: open && !expanded && !confirmingDiscard && !creatingType,
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          onOpenChange(true)
          return
        }
        details.cancel()
        // Never drop an in-flight add, whatever asked for the close.
        if (submitting) return
        // An open editor popup (link dialog, "/" menu) keeps Escape and its
        // own clicks, which land outside the dialog since it is portalled.
        if (
          (details.reason === "escape-key" && popupOpenOnEscape.current) ||
          (details.reason === "outside-press" &&
            isEditorPopup(details.event.target))
        ) {
          return
        }
        // Inside the full editor, Escape and outside clicks return to the
        // form instead of closing it. Base UI keeps Escape inside the dialog,
        // so run the collapse command here while it is bound to Escape.
        if (
          expanded &&
          (details.reason === "escape-key" ||
            details.reason === "outside-press")
        ) {
          if (
            details.reason === "escape-key" &&
            bindingKey(getBinding("createLink.collapseDescription")) ===
              "Escape"
          ) {
            collapse()
          }
          return
        }
        // Escape inside the New type panel closes the panel first.
        if (details.reason === "escape-key" && creatingType) {
          setCreatingType(false)
          return
        }
        requestClose()
      }}
    >
      <DialogContent
        ref={popup}
        showCloseButton={false}
        className={cn(
          "gap-0 rounded-3xl",
          expanded
            ? "flex h-[min(856px,calc(100dvh-3rem))] flex-col overflow-hidden p-0 sm:max-w-[1120px]"
            : "p-6 sm:max-w-[520px]"
        )}
      >
        <CreateLinkForm
          form={form}
          projectName={projectName}
          error={error ? frappeErrorMessage(error) : null}
          creatingType={creatingType}
          onCreatingTypeChange={setCreatingType}
          expanded={expanded}
          onExpand={expand}
          onCollapse={collapse}
        />
        <DiscardDraftDialog
          open={confirmingDiscard}
          onKeepEditing={() => setConfirmingDiscard(false)}
          onDiscard={close}
          record="link"
          draft="address, name and description"
        />
      </DialogContent>
    </Dialog>
  )
}
