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

/**
 * Turning on GitHub sync for a Project (docs/adr/0008): never automatic.
 * The manager reads the repository, who can read it, the privacy and
 * publication disclaimer and the open Tasks already tagged `github`; turning
 * sync on accepts the disclaimer and publishes them. Enable sends the
 * preview's token, so a backlog that changed since is refused rather than
 * published unseen; the dialog then shows the current one and asks again.
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
    defaultValues: {},
    onSubmit: async () => {
      const reviewed = latest.current.current
      if (!reviewed) return
      setError(null)
      let response: { message: ProjectGitHub }
      try {
        // Turning sync on is accepting the disclaimer the dialog shows.
        response = await latest.current.enable({
          project,
          acknowledge_private_data: true,
          acknowledge_publication: true,
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
  useScope("confirm", open)

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
          description="Read what is shared each way. Turning sync on accepts it."
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
                Every open Issue in this repository imports now with its
                sub-issues, closed ones included, labelled or not, and every new
                Issue imports as it arrives. A closed Issue, with everything
                under it, imports only once reopened. Pull requests never
                import.
              </p>
              <Disclaimer>
                Issues from this repository, private ones included, become tasks
                that everyone who can read this project's tasks in Envision can
                read.
              </Disclaimer>
            </section>

            <section
              className="flex flex-col gap-2.5"
              aria-labelledby="github-sync-out"
            >
              <h3 id="github-sync-out" className="text-sm font-semibold">
                To GitHub
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                Open tasks tagged github publish with their subtasks, completed
                ones included: title, description and status, kept in sync both
                ways. A completed tagged task publishes once reopened. Each
                Issue gets the envision-erpnext label. Deleting on one side
                never deletes on the other.
              </p>
              <MentionsWarning />
              <Disclaimer>
                {`Tagged tasks' titles and descriptions are copied to ${current.repository.full_name ?? "this repository"}${publicRepository ? ", where anyone may be able to read them" : ""}.`}
              </Disclaimer>
            </section>

            <Backlog preview={current} />
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
            disabled={!current || submitting}
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

/** One thing turning sync on accepts, set apart from the explanation. */
function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[12px] border bg-muted/50 px-4 py-3 text-sm leading-5">
      {children}
    </p>
  )
}

/** The open Tasks already tagged github, which publish when sync turns on. */
function Backlog({ preview }: { preview: SyncPreview }) {
  if (preview.backlog_count === 0) {
    return (
      <p className="text-sm leading-5 text-muted-foreground">
        No open tasks in this project are tagged github yet.
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
      <p className="text-xs leading-4.5 text-muted-foreground">
        They publish with their subtasks when sync turns on. Tasks tagged github
        from now on publish when tagged.
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
