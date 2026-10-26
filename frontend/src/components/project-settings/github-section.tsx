import * as React from "react"
import { useStore } from "@tanstack/react-form"
import {
  useFrappePostCall,
  useSWRConfig,
  type FrappeError,
} from "frappe-react-sdk"
import {
  GitBranchIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  UnlinkIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ActionButton } from "@/components/app-ui/action-button"
import {
  CompactField,
  PickerSelectTrigger,
} from "@/components/app-ui/field-controls"
import {
  ConfirmDialog,
  ConfirmFooter,
  ConfirmHeader,
} from "@/components/confirm-dialog"
import {
  GitHubTime,
  RepositoryLink,
  VisibilityBadge,
} from "@/components/github/github-parts"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { submitOnce, useAppForm } from "@/lib/form"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  isRepositoryDetails,
  isTaskGitHubKey,
  repositoryCandidatesKey,
  useProjectGitHub,
  useRepositoryCandidates,
  type ActivationImportState,
  type ProjectGitHub,
} from "@/lib/github"

import {
  EnableGitHubSyncDialog,
  MissingEvents,
} from "./enable-github-sync-dialog"

// Project Settings → GitHub (docs/adr/0007, 0008). Everyone who can read
// the Project sees its repository and how sync is doing. Only a System
// Manager or Projects Manager with write access to it (`can_manage`, which
// the server checks again on every action) connects a repository, turns
// sync on after the warnings, pauses, retries or disconnects. Connecting
// never turns sync on, and nothing here changes a Task's repository.

type ProjectAction = "pause" | "resume" | "retry"

const IMPORT_TEXT: Record<ActivationImportState, string> = {
  Queued: "Issues labelled github: waiting to import.",
  Running: "Issues labelled github: importing…",
  Done: "Issues labelled github were imported.",
  Failed: "Importing Issues labelled github failed. Retry to continue.",
}

export function GitHubSection({
  project,
  projectName,
}: {
  /** The Project's name (its id). */
  project: string
  projectName: string
}) {
  const { data, error, isLoading, mutate } = useProjectGitHub(project)
  const { mutate: revalidate } = useSWRConfig()
  const view = data?.message

  /** The server's answer is the new state; Tasks' GitHub state follows it. */
  async function show(next: ProjectGitHub) {
    await mutate({ message: next }, { revalidate: false })
    void revalidate(isTaskGitHubKey)
    void revalidate(repositoryCandidatesKey(project))
  }

  let body: React.ReactNode
  if (isLoading && !view) {
    body = <Skeleton className="h-28 w-full rounded-xl" />
  } else if (!view) {
    body = (
      <div className="flex items-center gap-3">
        <p role="alert" className="grow text-sm text-destructive">
          {error
            ? frappeErrorMessage(error)
            : "GitHub settings could not be loaded."}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void mutate()}
        >
          Try again
        </Button>
      </div>
    )
  } else if (!view.connected) {
    body = view.can_manage ? (
      <ConnectRepository project={project} onConnected={show} />
    ) : (
      <p className="text-sm leading-5 text-muted-foreground">
        This project isn't connected to a GitHub repository. A System Manager or
        Projects Manager can connect one.
      </p>
    )
  } else {
    body = (
      <ConnectedRepository
        view={view}
        project={project}
        projectName={projectName}
        onChange={show}
      />
    )
  }

  return (
    <section
      aria-labelledby="project-github-heading"
      className="flex flex-col gap-6 border-t pt-8 md:flex-row md:gap-12"
    >
      <div className="flex shrink-0 flex-col gap-1.5 md:w-54">
        <h2
          id="project-github-heading"
          className="flex items-center gap-2 text-base font-semibold"
        >
          <GitBranchIcon aria-hidden="true" className="size-4" />
          GitHub
        </h2>
        <p className="text-compact leading-5 text-muted-foreground">
          One repository whose Issues sync with this project's tasks, both ways.
        </p>
      </div>
      <div className="flex grow flex-col gap-5">{body}</div>
    </section>
  )
}

/** A manager picks one repository no other Project uses. Sync stays off. */
function ConnectRepository({
  project,
  onConnected,
}: {
  project: string
  onConnected: (view: ProjectGitHub) => Promise<void>
}) {
  const candidates = useRepositoryCandidates(project)
  const connect = useFrappePostCall<{ message: ProjectGitHub }>(
    "setu.api.github.connect_project_repository"
  )
  const options = React.useMemo(
    () =>
      (candidates.data?.message ?? []).map((repository) => ({
        value: repository.id,
        label: repository.full_name,
        private: repository.private,
      })),
    [candidates.data]
  )

  const form = useAppForm({
    defaultValues: { repository: "" },
    onSubmit: async ({ value }) => {
      // On failure the hook exposes `error`, rendered below.
      const response = await connect
        .call({ project, repository: value.repository })
        .catch(() => null)
      if (!response) {
        // Another project may have taken it meanwhile.
        void candidates.mutate()
        return
      }
      form.reset()
      await onConnected(response.message)
      toast.success(
        "Repository connected. Sync stays off until you turn it on."
      )
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const picked = useStore(form.store, (state) => state.values.repository)

  if (candidates.isLoading && !candidates.data) {
    return <Skeleton className="h-20 w-full rounded-xl" />
  }
  if (candidates.error && !candidates.data) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="grow text-sm text-destructive">
          {frappeErrorMessage(candidates.error)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void candidates.mutate()}
        >
          Try again
        </Button>
      </div>
    )
  }
  if (!options.length) {
    return (
      <p className="text-sm leading-5 text-muted-foreground">
        No repository is available. A System Manager connects this site's GitHub
        App and gives it access to repositories in Settings → GitHub.
        Repositories other projects use aren't listed.
      </p>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void submitOnce(form)
      }}
    >
      <form.Field
        name="repository"
        validators={{
          onSubmit: ({ value }) =>
            value ? undefined : "Choose a repository to connect.",
        }}
      >
        {(field) => {
          const fieldError = field.state.meta.errors.find(
            (item) => typeof item === "string"
          )
          return (
            <CompactField data-invalid={fieldError ? true : undefined}>
              <FieldLabel htmlFor="project-github-repository">
                Repository
              </FieldLabel>
              <Select
                items={options}
                value={field.state.value || null}
                onValueChange={(next: string | null) =>
                  field.handleChange(next ?? "")
                }
                onOpenChange={(open) => {
                  if (!open) field.handleBlur()
                }}
                disabled={submitting}
              >
                <PickerSelectTrigger
                  id="project-github-repository"
                  aria-invalid={fieldError ? true : undefined}
                >
                  <SelectValue>
                    {(current: string | null) => {
                      const option = options.find(
                        (item) => item.value === current
                      )
                      return option ? (
                        option.label
                      ) : (
                        <span className="text-muted-foreground">
                          Choose a repository
                        </span>
                      )
                    }}
                  </SelectValue>
                </PickerSelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="grow">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.private ? "Private" : "Public"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{fieldError}</FieldError>
            </CompactField>
          )
        }}
      </form.Field>
      <p className="text-xs leading-4.5 text-muted-foreground">
        Connecting syncs nothing. You turn sync on next, after reviewing what is
        shared. A repository connects to one project only.
      </p>
      {connect.error ? (
        <FieldError>{frappeErrorMessage(connect.error)}</FieldError>
      ) : null}
      <div className="flex justify-end">
        <ActionButton type="submit" size="md" disabled={!picked || submitting}>
          {submitting ? "Connecting…" : "Connect repository"}
        </ActionButton>
      </div>
    </form>
  )
}

function ConnectedRepository({
  view,
  project,
  projectName,
  onChange,
}: {
  view: ProjectGitHub
  project: string
  projectName: string
  onChange: (view: ProjectGitHub) => Promise<void>
}) {
  const pause = useFrappePostCall<{ message: ProjectGitHub }>(
    "setu.api.github.pause_project_sync"
  )
  const resume = useFrappePostCall<{ message: ProjectGitHub }>(
    "setu.api.github.resume_project_sync"
  )
  const retry = useFrappePostCall<{ message: ProjectGitHub }>(
    "setu.api.github.retry_project_sync"
  )
  const enable = useFrappePostCall<{ message: ProjectGitHub }>(
    "setu.api.github.enable_project_sync"
  )
  const disconnect = useFrappePostCall<{ message: ProjectGitHub }>(
    "setu.api.github.disconnect_project_repository"
  )
  const calls = { pause, resume, retry }

  const [running, setRunning] = React.useState<ProjectAction | null>(null)
  const runningRef = React.useRef(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [dialog, setDialog] = React.useState<"enable" | "disconnect" | null>(
    null
  )

  /** One action at a time; its refusal shows under the buttons. */
  async function act(action: ProjectAction, success: string) {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(action)
    setActionError(null)
    try {
      const response = await calls[action].call({ project })
      await onChange(response.message)
      toast.success(success)
    } catch (failure) {
      setActionError(frappeErrorMessage(failure as FrappeError))
    } finally {
      runningRef.current = false
      setRunning(null)
    }
  }

  const repository = view.repository
  const details =
    repository && isRepositoryDetails(repository) ? repository : null
  const fullName = details?.full_name ?? null
  const counts = view.counts
  const linkedTasks = counts.linked + counts.paused
  const failedImport = view.activation_import_state === "Failed"
  // Blockers other than sync being off or paused: access, site or app.
  const problem =
    view.blocker &&
    view.blocker !== "sync_not_enabled" &&
    view.blocker !== "sync_paused"
      ? view.blocker_message
      : null
  const busy = running !== null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <RepositoryLink
            fullName={fullName}
            url={details?.html_url}
            fallback={`Repository ${repository?.id ?? ""} (no longer listed by the GitHub App)`}
          />
          {details ? <VisibilityBadge isPrivate={details.private} /> : null}
        </div>
        <p className="text-sm leading-5" aria-live="polite">
          {syncText(view)}
        </p>
        {problem ? (
          <p role="alert" className="text-sm leading-5 text-destructive">
            {problem}
          </p>
        ) : null}
        {view.sync_enabled ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Turned on</dt>
            <dd>
              {view.activated_on ? (
                <GitHubTime value={view.activated_on} />
              ) : (
                "—"
              )}
              {view.activated_by ? ` by ${view.activated_by}` : ""}
            </dd>
            <dt className="text-muted-foreground">Tasks</dt>
            <dd>{countsText(view)}</dd>
          </dl>
        ) : null}
        {view.activation_import_state ? (
          <p
            className={
              failedImport
                ? "text-sm leading-5 text-destructive"
                : "text-sm leading-5 text-muted-foreground"
            }
          >
            {IMPORT_TEXT[view.activation_import_state]}
          </p>
        ) : null}
      </div>

      {view.can_manage && view.last_error ? (
        <p role="alert" className="text-sm leading-5 text-destructive">
          Last error: {view.last_error}
        </p>
      ) : null}
      {view.can_manage && view.missing_events.length ? (
        <MissingEvents events={view.missing_events} />
      ) : null}

      {view.can_manage ? (
        <div className="flex flex-wrap items-center gap-2">
          {!view.sync_enabled ? (
            <ActionButton
              type="button"
              size="md"
              disabled={busy || Boolean(view.inactive_reason)}
              onClick={() => {
                setActionError(null)
                setDialog("enable")
              }}
            >
              Turn on sync…
            </ActionButton>
          ) : view.paused ? (
            <ActionButton
              type="button"
              size="md"
              className="gap-2"
              disabled={busy}
              onClick={() => void act("resume", "GitHub sync resumed")}
            >
              <PlayIcon className="size-3.5" />
              {running === "resume" ? "Resuming…" : "Resume sync"}
            </ActionButton>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void act("pause", "GitHub sync paused")}
            >
              <PauseIcon />
              {running === "pause" ? "Pausing…" : "Pause sync"}
            </Button>
          )}
          {view.sync_enabled && (counts.error > 0 || failedImport) ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void act("retry", "Retrying failed GitHub sync")}
            >
              <RefreshCwIcon />
              {running === "retry" ? "Retrying…" : "Retry failed"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => {
              setActionError(null)
              setDialog("disconnect")
            }}
          >
            <UnlinkIcon />
            Disconnect repository…
          </Button>
        </div>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm leading-5 text-destructive">
          {actionError}
        </p>
      ) : null}

      {view.can_manage ? (
        <>
          <EnableGitHubSyncDialog
            open={dialog === "enable"}
            onOpenChange={(open) => {
              if (!open) setDialog(null)
            }}
            project={project}
            projectName={projectName}
            enable={enable.call}
            onEnabled={async (next) => {
              await onChange(next).catch(() => undefined)
              toast.success(`GitHub sync is on for ${projectName}`)
            }}
          />
          <ConfirmDialog
            open={dialog === "disconnect"}
            onOpenChange={(open) => {
              if (!open) setDialog(null)
            }}
            onConfirm={async () => {
              const response = await disconnect.call({ project })
              await onChange(response.message).catch(() => undefined)
              toast(`${fullName ?? "Repository"} disconnected`)
            }}
          >
            <ConfirmHeader
              tone="destructive"
              icon={<UnlinkIcon />}
              title={`Disconnect ${fullName ?? "this repository"}?`}
              description="Sync stops for this project. Nothing is deleted in Envision or on GitHub."
            />
            <p className="text-sm leading-5">
              {linkedTasks
                ? `${linkedTasks === 1 ? "1 task linked to an Issue pauses" : `${linkedTasks} tasks linked to Issues pause`} and keeps its Issue. `
                : "No tasks are linked to Issues yet. "}
              Connecting the same repository and turning sync on again resumes
              them after comparing both sides; another repository leaves them
              paused.
            </p>
            <ConfirmFooter
              tone="destructive"
              label="Disconnect"
              pendingLabel="Disconnecting…"
              ready
            />
          </ConfirmDialog>
        </>
      ) : null}
    </div>
  )
}

function syncText(view: ProjectGitHub): string {
  if (!view.sync_enabled) {
    return view.can_manage
      ? "Sync is off. Nothing moves between Envision and GitHub until you turn it on."
      : "Sync is off. Nothing moves between Envision and GitHub."
  }
  if (view.paused) {
    return "Sync is paused. Changes on GitHub wait until it resumes."
  }
  return "Sync is on: new Issues and tasks tagged github sync both ways."
}

function countsText(view: ProjectGitHub): string {
  const { linked, pending, conflict, error, paused } = view.counts
  const parts = [`${linked} syncing`]
  if (pending) parts.push(`${pending} pending`)
  if (conflict) parts.push(`${conflict} in conflict`)
  if (error) parts.push(`${error} with errors`)
  if (paused) parts.push(`${paused} paused`)
  return parts.join(" · ")
}
