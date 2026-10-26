import * as React from "react"
import { useStore } from "@tanstack/react-form"
import type { FrappeError } from "frappe-react-sdk"
import { GitBranchIcon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import {
  PromptDialogContent,
  PromptDialogFooter,
  PromptDialogHeader,
  PromptDialogIcon,
} from "@/components/app-ui/prompt-dialog"
import {
  MentionsWarning,
  RepositoryLink,
  VisibilityBadge,
} from "@/components/github/github-parts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useScope } from "@/lib/commands"
import { submitOnce, useAppForm } from "@/lib/form"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  audienceText,
  useSyncPreview,
  type ProjectGitHub,
  type SyncPreview,
} from "@/lib/github"
import { cn } from "@/lib/utils"

/**
 * Turning on GitHub sync for a Project (docs/adr/0008): never automatic.
 * The manager sees the repository and who can read it, accepts the privacy
 * and publication warnings, and sees the Tasks already tagged `github`,
 * choosing to publish them now or hold them. Enable sends the preview's
 * token, so a backlog that changed since is refused rather than published
 * unseen; the dialog then shows the current one and asks again.
 */
export function EnableGitHubSyncDialog({
  open,
  onOpenChange,
  project,
  projectName,
  onEnabled,
  enable,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: string
  projectName: string
  /** Show the Project's new state; never rejects. */
  onEnabled: (view: ProjectGitHub) => Promise<void>
  /** setu.api.github.enable_project_sync; rejects with the refusal. */
  enable: (params: {
    project: string
    acknowledge_private_data: boolean
    acknowledge_publication: boolean
    publish_backlog: boolean
    backlog_token: string
  }) => Promise<{ message: ProjectGitHub }>
}) {
  const preview = useSyncPreview(open ? project : null)
  const current = preview.data?.message
  const [error, setError] = React.useState<string | null>(null)
  // The form is made while the dialog is closed; read what is current now.
  const refreshPreview = preview.mutate
  const latest = React.useRef({
    onEnabled,
    onOpenChange,
    enable,
    current,
    refreshPreview,
  })
  React.useEffect(() => {
    latest.current = {
      onEnabled,
      onOpenChange,
      enable,
      current,
      refreshPreview,
    }
  })

  const form = useAppForm({
    defaultValues: {
      acknowledge_private_data: false,
      acknowledge_publication: false,
      publish_backlog: false,
    },
    onSubmit: async ({ value }) => {
      const reviewed = latest.current.current
      if (!reviewed) return
      setError(null)
      let response: { message: ProjectGitHub }
      try {
        response = await latest.current.enable({
          project,
          ...value,
          publish_backlog: value.publish_backlog && reviewed.backlog_count > 0,
          backlog_token: reviewed.backlog_token,
        })
      } catch (failure) {
        setError(frappeErrorMessage(failure as FrappeError))
        // The tagged tasks may have changed since the preview: show them.
        void latest.current.refreshPreview()
        return
      }
      await latest.current.onEnabled(response.message)
      latest.current.onOpenChange(false)
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const acknowledged = useStore(
    form.store,
    (state) =>
      state.values.acknowledge_private_data &&
      state.values.acknowledge_publication
  )
  useScope("confirm", open)

  // A different backlog was not what the manager chose to publish.
  const token = current?.backlog_token
  const seenToken = React.useRef(token)
  React.useEffect(() => {
    if (seenToken.current && token && token !== seenToken.current) {
      form.setFieldValue("publish_backlog", false)
    }
    seenToken.current = token
  }, [token, form])

  const repository = current?.repository
  const publicRepository = repository?.private !== true

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (!next && submitting) {
          details.cancel()
          return
        }
        onOpenChange(next)
      }}
      onOpenChangeComplete={(next) => {
        if (!next) {
          setError(null)
          form.reset()
          seenToken.current = undefined
        }
      }}
    >
      <PromptDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <PromptDialogHeader
          icon={
            <PromptDialogIcon tone="neutral">
              <GitBranchIcon />
            </PromptDialogIcon>
          }
          title={`Turn on GitHub sync for ${projectName}?`}
          description="Read what is shared each way. Nothing syncs until you turn it on."
        />

        {preview.error && !current ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="grow text-sm text-destructive">
              {frappeErrorMessage(preview.error)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void preview.mutate()}
            >
              Try again
            </Button>
          </div>
        ) : !current ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-16 w-full rounded-[12px]" />
            <Skeleton className="h-24 w-full rounded-[12px]" />
            <span className="sr-only">Loading what turning on sync does…</span>
          </div>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void submitOnce(form)
            }}
            id="enable-github-sync"
          >
            <div className="flex flex-col gap-2 rounded-[12px] border bg-background px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <RepositoryLink
                  fullName={current.repository.full_name}
                  url={current.repository.html_url}
                  fallback={`Repository ${current.repository.id}`}
                />
                <VisibilityBadge isPrivate={current.repository.private} />
              </div>
              <p className="text-sm leading-5 text-muted-foreground">
                {audienceText(current.repository.private)}
              </p>
            </div>

            {current.missing_events.length ? (
              <MissingEvents events={current.missing_events} />
            ) : null}

            <section
              className="flex flex-col gap-2.5"
              aria-labelledby="github-sync-in"
            >
              <h3 id="github-sync-in" className="text-sm font-semibold">
                Into Envision
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                Issues labelled github import now. From now on every new Issue
                imports, labelled or not. Older unlabelled Issues and pull
                requests never import.
              </p>
              <form.Field name="acknowledge_private_data">
                {(field) => (
                  <Acknowledgement
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={submitting}
                  >
                    Issues from this repository, private ones included, become
                    tasks that everyone who can read this project's tasks in
                    Envision can read.
                  </Acknowledgement>
                )}
              </form.Field>
            </section>

            <section
              className="flex flex-col gap-2.5"
              aria-labelledby="github-sync-out"
            >
              <h3 id="github-sync-out" className="text-sm font-semibold">
                To GitHub
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                Tasks tagged github publish with their subtasks: title,
                description and status, kept in sync both ways. Deleting on one
                side never deletes on the other.
              </p>
              <MentionsWarning />
              <form.Field name="acknowledge_publication">
                {(field) => (
                  <Acknowledgement
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={submitting}
                  >
                    {`Tagged tasks' titles and descriptions are copied to ${current.repository.full_name ?? "this repository"}${publicRepository ? ", where anyone may be able to read them" : ""}.`}
                  </Acknowledgement>
                )}
              </form.Field>
            </section>

            <Backlog preview={current}>
              <form.Field name="publish_backlog">
                {(field) => (
                  <Acknowledgement
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={submitting}
                  >
                    {`Publish ${current.backlog_count === 1 ? "this task" : `these ${current.backlog_count} tasks`} to GitHub now`}
                  </Acknowledgement>
                )}
              </form.Field>
            </Backlog>
          </form>
        )}

        {error ? (
          <p role="alert" className="-mt-2 text-sm leading-5 text-destructive">
            {error}
          </p>
        ) : null}

        <PromptDialogFooter>
          <DialogClose
            disabled={submitting}
            render={<Button type="button" variant="outline" size="lg" />}
          >
            Cancel
          </DialogClose>
          <ActionButton
            type="submit"
            form="enable-github-sync"
            tone="inverse"
            size="lg"
            disabled={!current || !acknowledged || submitting}
            focusableWhenDisabled
            className="data-disabled:opacity-60"
          >
            {submitting ? "Turning on…" : "Turn on sync"}
          </ActionButton>
        </PromptDialogFooter>
      </PromptDialogContent>
    </Dialog>
  )
}

/** A checkbox the manager ticks to accept one warning or choice. */
function Acknowledgement({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-3 text-sm leading-5",
        checked && "bg-muted/50",
        disabled && "cursor-not-allowed opacity-70"
      )}
    >
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next)}
      />
      <span>{children}</span>
    </label>
  )
}

/** The Tasks already tagged github, which publish only if chosen. */
function Backlog({
  preview,
  children,
}: {
  preview: SyncPreview
  /** The publish-now choice. */
  children: React.ReactNode
}) {
  if (preview.backlog_count === 0) {
    return (
      <p className="text-sm leading-5 text-muted-foreground">
        No tasks in this project are tagged github yet.
      </p>
    )
  }
  return (
    <section
      className="flex flex-col gap-2.5"
      aria-labelledby="github-sync-backlog"
    >
      <h3 id="github-sync-backlog" className="text-sm font-semibold">
        Already tagged github ({preview.backlog_count}, subtasks included)
      </h3>
      <ul className="max-h-48 divide-y overflow-y-auto rounded-[12px] border">
        {preview.backlog.map((task) => (
          <li
            key={task.name}
            className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm"
          >
            <span className="min-w-0 wrap-anywhere">{task.subject}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {task.name}
              {task.subtasks
                ? ` · ${task.subtasks} subtask${task.subtasks === 1 ? "" : "s"}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
      {children}
      <p className="text-xs leading-4.5 text-muted-foreground">
        Left off, they wait unpublished: each can be published from its task
        page. Tasks tagged github from now on publish when tagged.
      </p>
    </section>
  )
}

/** Webhook events the GitHub App must receive for sync to work. */
export function MissingEvents({ events }: { events: string[] }) {
  return (
    <p
      role="alert"
      className="rounded-[12px] border border-destructive/35 bg-destructive/6 px-4 py-3 text-sm leading-5"
    >
      The GitHub App doesn't receive these events: {events.join(", ")}. Sync
      can't be turned on until it receives them. A System Manager subscribes the
      app to them on GitHub (Permissions & events), then uses Refresh in
      Settings → GitHub.
    </p>
  )
}
