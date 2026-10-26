import * as React from "react"
import {
  useFrappePostCall,
  useSWRConfig,
  type FrappeError,
} from "frappe-react-sdk"
import {
  CheckIcon,
  CircleAlertIcon,
  ClockIcon,
  GitMergeIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SendIcon,
  UnlinkIcon,
} from "lucide-react"

import { StatusBadge } from "@/components/app-ui/status-badge"
import {
  ConfirmDialog,
  ConfirmFooter,
  ConfirmHeader,
} from "@/components/confirm-dialog"
import { ConflictDialog } from "@/components/github/conflict-dialog"
import { GitHubTime, RepositoryLink } from "@/components/github/github-parts"
import { PublishToGitHubDialog } from "@/components/github/publish-dialog"
import { RailGroup } from "@/components/record-detail"
import { Button } from "@/components/ui/button"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  CONFLICT_FIELD_LABELS,
  CONFLICT_KIND_TEXT,
  LINK_STATE_LABELS,
  isActiveLink,
  useTaskGitHub,
  type ConflictChoice,
  type ConflictField,
  type LinkState,
  type TaskGitHub,
} from "@/lib/github"
import {
  descendantsOf,
  projectTasksKey,
  taskActivityKey,
  taskKey,
  useProjectTasks,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"

// The Task page's GitHub block, in the rail above the Activity: where the
// Task is on GitHub, how its sync is doing, its conflicts, and the actions
// the server allows this user (`actions`). Sync runs on the server; every
// action here asks it and shows what it answers.

type TaskAction = "publish" | "retry" | "pause" | "resume" | "disconnect"

const STATE_ICONS: Record<LinkState, React.ReactNode> = {
  Pending: <ClockIcon />,
  Synced: <CheckIcon className="text-success" />,
  Conflict: <GitMergeIcon className="text-destructive" />,
  Error: <CircleAlertIcon className="text-destructive" />,
  Paused: <PauseIcon />,
  Disconnected: <UnlinkIcon />,
  Tombstoned: <UnlinkIcon />,
}

const INELIGIBLE_TEXT = {
  milestone: "Milestones don't sync with GitHub.",
  template: "Templates don't sync with GitHub.",
  cancelled: "Cancelled tasks don't sync with GitHub.",
  no_project: "Only tasks in a project sync with GitHub.",
} as const

export function TaskGitHubPanel({
  task,
  project,
}: {
  task: string
  /** The Project's name (its id). */
  project: string
}) {
  const { mutate: revalidate } = useSWRConfig()
  const { data, error, isLoading, mutate } = useTaskGitHub(task)
  const view = data?.message

  const publish = useFrappePostCall<{ message: TaskGitHub }>(
    "setu.api.github.publish_task"
  )
  const retry = useFrappePostCall<{ message: TaskGitHub }>(
    "setu.api.github.retry_task_sync"
  )
  const pause = useFrappePostCall<{ message: TaskGitHub }>(
    "setu.api.github.pause_task_sync"
  )
  const resume = useFrappePostCall<{ message: TaskGitHub }>(
    "setu.api.github.resume_task_sync"
  )
  const disconnect = useFrappePostCall<{ message: TaskGitHub }>(
    "setu.api.github.disconnect_task_sync"
  )
  const resolve = useFrappePostCall<{ message: TaskGitHub }>(
    "setu.api.github.resolve_task_conflict"
  )
  const calls = { publish, retry, pause, resume, disconnect }

  const [running, setRunning] = React.useState<TaskAction | null>(null)
  const runningRef = React.useRef(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<
    "publish" | "disconnect" | null
  >(null)
  const [reviewing, setReviewing] = React.useState<ConflictField | null>(null)

  // Subtasks that would publish with it, from the list the page has loaded.
  const { data: projectTasks } = useProjectTasks(project)
  const subtasks = React.useMemo(
    () => (projectTasks ? descendantsOf(projectTasks, task).size : 0),
    [projectTasks, task]
  )

  // A sync that changed the Task (from GitHub, or a chosen resolution) shows
  // on the rest of the page too.
  const lastSynced = view?.link?.last_synced_at ?? null
  const seen = React.useRef<string | null | undefined>(undefined)
  React.useEffect(() => {
    if (!view) return
    const previous = seen.current
    seen.current = lastSynced
    if (previous === undefined || previous === lastSynced) return
    void revalidate(taskKey(task))
    void revalidate(taskActivityKey(task))
    void revalidate(projectTasksKey(project))
  }, [view, lastSynced, revalidate, task, project])

  async function show(response: { message: TaskGitHub }) {
    await mutate(response, { revalidate: false })
    void revalidate(taskActivityKey(task))
  }

  /** An action without a confirm: one at a time, its refusal shown below. */
  async function act(action: Exclude<TaskAction, "publish" | "disconnect">) {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(action)
    setActionError(null)
    try {
      await show(await calls[action].call({ task }))
    } catch (failure) {
      setActionError(frappeErrorMessage(failure as FrappeError))
      // A refusal usually means the state moved on: show the current one.
      void mutate()
    } finally {
      runningRef.current = false
      setRunning(null)
    }
  }

  /** An action behind a confirm, which shows its refusal itself. */
  async function confirmed(action: "publish" | "disconnect") {
    setActionError(null)
    try {
      await show(await calls[action].call({ task }))
    } catch (failure) {
      void mutate()
      throw failure
    }
  }

  if (isLoading && !view) return null
  if (error && !view) {
    return (
      <RailGroup className="gap-2">
        <h2 className="text-compact text-muted-foreground">GitHub</h2>
        <p role="alert" className="text-sm text-destructive">
          {frappeErrorMessage(error)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => void mutate()}
        >
          Try again
        </Button>
      </RailGroup>
    )
  }
  if (!view) return null

  const { link, route, actions } = view
  // Untagged, unlinked Tasks in a Project without sync have nothing to show.
  if (!link && !view.tagged && !route.sync_enabled) return null

  const conflict =
    link?.conflicts.find((row) => row.field === reviewing) ?? null
  const active = link !== null && isActiveLink(link.state)
  const busy = running !== null

  return (
    <RailGroup className="gap-2.5">
      <h2 className="text-compact text-muted-foreground">GitHub</h2>

      {link ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge className="[&_svg]:size-3">
              {STATE_ICONS[link.state]}
              {LINK_STATE_LABELS[link.state]}
            </StatusBadge>
            {link.issue_url && link.issue_number ? (
              <RepositoryLink
                fullName={`${link.repository_full_name ?? ""}#${link.issue_number}`}
                url={link.issue_url}
                fallback=""
                className="text-sm"
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                {link.repository_full_name ?? "Not on GitHub yet"}
              </span>
            )}
          </div>
          {link.message ? (
            <p className="text-sm leading-5 text-muted-foreground">
              {link.message}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Last synced{" "}
            {link.last_synced_at ? (
              <GitHubTime value={link.last_synced_at} />
            ) : (
              "never"
            )}
            {active && link.pending_operations > 0 ? " · Syncing…" : ""}
          </p>
          {link.uncertain ? (
            <p className="text-sm leading-5">
              A request to create its Issue didn't get an answer. Envision looks
              for that Issue on GitHub before trying again, so it never creates
              two.
            </p>
          ) : null}
          {link.error ? (
            <p className="text-sm leading-5 text-destructive">{link.error}</p>
          ) : null}
          {link.hierarchy_error ? (
            <p className="text-sm leading-5 text-destructive">
              {link.hierarchy_error}
            </p>
          ) : null}
          {link.conflicts.length ? (
            <ul className="flex flex-col gap-1.5">
              {link.conflicts.map((row) => (
                <li key={row.field}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => {
                      resolve.reset()
                      setReviewing(row.field)
                    }}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <GitMergeIcon className="size-3.5 text-destructive" />
                      {CONFLICT_FIELD_LABELS[row.field]} conflict
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.resolution
                        ? `${row.resolution === "envision" ? "Keep Envision" : "Keep GitHub"} chosen; applies at the next sync.`
                        : CONFLICT_KIND_TEXT[row.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {active ? (
            <p className="text-xs leading-4.5 text-muted-foreground">
              New subtasks publish too. Removing the github tag doesn't stop
              sync.
            </p>
          ) : null}
        </div>
      ) : (
        <p
          className="text-sm leading-5 text-muted-foreground"
          aria-live="polite"
        >
          {unlinkedText(view)}
        </p>
      )}

      {actionError ? (
        <p role="alert" className="text-sm leading-5 text-destructive">
          {actionError}
        </p>
      ) : null}

      <TaskGitHubActions
        view={view}
        running={running}
        busy={busy}
        onPublish={() => {
          setActionError(null)
          setConfirming("publish")
        }}
        onDisconnect={() => {
          setActionError(null)
          setConfirming("disconnect")
        }}
        onAct={(action) => void act(action)}
      />

      <PublishToGitHubDialog
        open={confirming === "publish"}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        target={{ repository: route.repository, subtasks }}
        label="Publish"
        pendingLabel="Publishing…"
        onConfirm={() => confirmed("publish")}
      />
      <ConfirmDialog
        open={confirming === "disconnect"}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        onConfirm={() => confirmed("disconnect")}
      >
        <ConfirmHeader
          tone="destructive"
          icon={<UnlinkIcon />}
          title="Stop syncing with GitHub?"
          description={
            link?.issue_number
              ? `This task stops syncing with Issue #${link.issue_number}. The Issue is left as it is on GitHub, and nothing is deleted.`
              : "This task stops syncing with GitHub, and nothing is deleted."
          }
        />
        <p className="text-sm leading-5">
          Adding the github tag again won't publish it. Resume reconnects this
          task to the same Issue, after comparing both sides.
        </p>
        <ConfirmFooter
          tone="destructive"
          label="Disconnect"
          pendingLabel="Disconnecting…"
          ready
        />
      </ConfirmDialog>
      <ConflictDialog
        conflict={conflict}
        onOpenChange={(open) => {
          if (!open) setReviewing(null)
        }}
        canResolve={actions.resolve}
        onResolve={async (choice: ConflictChoice) => {
          if (!conflict) return
          try {
            await show(
              await resolve.call({ task, field: conflict.field, choice })
            )
          } catch (failure) {
            void mutate()
            throw failure
          }
        }}
      />
    </RailGroup>
  )
}

function TaskGitHubActions({
  view,
  running,
  busy,
  onPublish,
  onDisconnect,
  onAct,
}: {
  view: TaskGitHub
  running: TaskAction | null
  busy: boolean
  onPublish: () => void
  onDisconnect: () => void
  onAct: (action: "retry" | "pause" | "resume") => void
}) {
  const { actions } = view
  if (
    !actions.publish &&
    !actions.retry &&
    !actions.pause &&
    !actions.resume &&
    !actions.disconnect
  ) {
    return null
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.publish ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={onPublish}
        >
          <SendIcon />
          Publish…
        </Button>
      ) : null}
      {actions.retry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onAct("retry")}
        >
          <RefreshCwIcon
            className={cn(running === "retry" && "animate-spin")}
          />
          {running === "retry" ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
      {actions.resume ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onAct("resume")}
        >
          <PlayIcon />
          {running === "resume" ? "Resuming…" : "Resume"}
        </Button>
      ) : null}
      {actions.pause ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onAct("pause")}
        >
          <PauseIcon />
          {running === "pause" ? "Pausing…" : "Pause"}
        </Button>
      ) : null}
      {actions.disconnect ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onDisconnect}
        >
          <UnlinkIcon />
          Disconnect…
        </Button>
      ) : null}
    </div>
  )
}

/** A Task with no link: why it is not on GitHub, or what would publish it. */
function unlinkedText(view: TaskGitHub): string {
  if (!view.eligible && view.ineligible_reason) {
    return INELIGIBLE_TEXT[view.ineligible_reason]
  }
  if (view.tagged) {
    if (view.waiting_reason === "not_connected") {
      return "Tagged github. It publishes once this project is connected to a GitHub repository and a manager turns on sync."
    }
    if (view.waiting_reason === "sync_not_enabled") {
      return "Tagged github. It publishes once a manager turns on GitHub sync for this project and reviews the tagged tasks."
    }
    return view.waiting_message ?? "Tagged github; waiting to publish."
  }
  const repository = view.route.repository?.full_name
  return repository
    ? `Not on GitHub. Adding the github tag publishes it to ${repository}.`
    : "Not on GitHub. Adding the github tag publishes it."
}
