import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"

import {
  CreatePublishNotice,
  type PublishTarget,
} from "@/components/github/publish-dialog"
import { useGitHubTagConfirm } from "@/components/github/use-github-tag-confirm"
import { DATE_PICKER_POPUP } from "@/components/milestones/date-picker"
import { DiscardDraftDialog } from "@/components/milestones/discard-draft-dialog"
import { CreateSheetContent } from "@/components/app-ui/editor-panel"
import { Sheet } from "@/components/ui/sheet"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  hasGitHubTag,
  isActiveLink,
  repositoryView,
  useProjectGitHub,
  useTaskGitHub,
} from "@/lib/github"
import type { CreateStatus } from "@/lib/tasks"

import { CreateTaskForm } from "./create-task-form"
import {
  EMPTY_TASK,
  createTaskFormOptions,
  hasDraft,
  submitOnce,
  useAppForm,
  type TaskValues,
} from "./form"

/** The editor package marks every popup it portals out of the panel. */
function isEditorPopup(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("[data-richtext-portal]")
}

/** A popup portalled to <body> that owns clicks and Escape while open. */
const OWN_POPUPS = `[data-richtext-portal], ${DATE_PICKER_POPUP}`

/**
 * Create Task panel (Paper screen 03), opened from a Board column's "+" (its
 * Status picked), from a section's "+" (its Status and Module picked), from
 * a milestone's or module's page (that link picked), or as Create subtask
 * (09m) from a Task's Subtasks (its parent picked, and what the inline row
 * held). Like
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
  parent,
  initial,
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
  /**
   * The Task whose Subtasks the panel was opened from: it shows the Parent
   * task field with this Task picked.
   */
  parent?: string
  /** What the inline row already held: the title and its picks. */
  initial?: Partial<TaskValues>
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
        // Everyone picked; the older single `assignee` is never sent with it.
        assignees: value.assignees.length ? value.assignees : undefined,
        milestone: value.milestone || undefined,
        module: value.module || undefined,
        tags: value.tags,
        parent_task: value.parent_task || undefined,
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

  // GitHub (components/github/publish-dialog): a Subtask of a syncing Task
  // publishes with it; otherwise adding the github tag asks first when the
  // Project syncs. Until the Project's state has loaded, the tag asks
  // without knowing the repository.
  const tags = useSelector(form.store, (state) => state.values.tags)
  const parentTask = useSelector(
    form.store,
    (state) => state.values.parent_task
  )
  const projectGitHub = useProjectGitHub(open ? project : null)
  const parentGitHub = useTaskGitHub(open && parentTask ? parentTask : null)
  const route = projectGitHub.data?.message
  const parentView = parentTask ? parentGitHub.data?.message : undefined
  const parentPublishing = Boolean(
    parentView?.link &&
    isActiveLink(parentView.link.state) &&
    parentView.route.sync_enabled
  )
  const repository = route ? repositoryView(route.repository) : null
  const publishTarget = React.useMemo<PublishTarget | null>(() => {
    if (parentPublishing) return null
    if (!route) return { repository: null, subtasks: 0 }
    return route.sync_enabled ? { repository, subtasks: 0 } : null
  }, [parentPublishing, route, repository])
  const { confirmTags, dialog: publishDialog } = useGitHubTagConfirm(
    publishTarget,
    { creating: true }
  )
  let githubNotice: React.ReactNode = null
  if (parentPublishing) {
    githubNotice = (
      <CreatePublishNotice
        kind="subtask"
        repository={parentView?.route.repository ?? null}
      />
    )
  } else if (hasGitHubTag(tags) && route?.sync_enabled) {
    githubNotice = <CreatePublishNotice kind="tagged" repository={repository} />
  } else if (hasGitHubTag(tags) && route?.connected) {
    githubNotice = (
      <CreatePublishNotice kind="backlog" repository={repository} />
    )
  }

  // Each open starts from an empty form in the column's Status. Before paint,
  // so the Status field never shows the previous column's.
  React.useLayoutEffect(() => {
    if (open) {
      form.reset({
        ...EMPTY_TASK,
        status,
        module: module ?? "",
        milestone: milestone ?? "",
        parent_task: parent ?? "",
        ...initial,
      })
    }
  }, [open, status, module, milestone, parent, initial, form])

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
      <CreateSheetContent ref={popup}>
        <CreateTaskForm
          form={form}
          project={project}
          projectName={projectName}
          error={error ? frappeErrorMessage(error) : null}
          withParent={parent !== undefined}
          confirmTags={confirmTags}
          githubNotice={githubNotice}
        />
        <DiscardDraftDialog
          open={confirmingDiscard}
          onKeepEditing={() => setConfirmingDiscard(false)}
          onDiscard={close}
          record="task"
        />
        {publishDialog}
      </CreateSheetContent>
    </Sheet>
  )
}
