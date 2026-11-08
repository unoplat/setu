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
  RefreshCwIcon,
  Trash2Icon,
  UnlinkIcon,
} from "lucide-react"

import { StatusBadge } from "@/components/app-ui/status-badge"
import {
  GitHubTime,
  NextRetry,
  RepositoryLink,
} from "@/components/github/github-parts"
import { RailGroup } from "@/components/record-detail"
import { Button } from "@/components/ui/button"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  LINK_STATE_LABELS,
  isActiveLink,
  useTaskGitHub,
  type LinkState,
  type TaskGitHub,
  type TaskLink,
  type TaskRetry,
} from "@/lib/github"
import { projectTasksKey, taskActivityKey, taskKey } from "@/lib/tasks"
import { cn } from "@/lib/utils"

// The Task page's GitHub block, in the rail above the Activity: where the
// Task is on GitHub, how its sync is doing, what failed and when it retries,
// and the actions the server allows this user (`actions`). Sync runs on the
// server; every action here asks it and shows what it answers.

const STATE_ICONS: Record<LinkState, React.ReactNode> = {
  not_synced: <ClockIcon />,
  synced: <CheckIcon className="text-success" />,
  to_be_updated: <ClockIcon />,
  cron_sync: <CircleAlertIcon className="text-destructive" />,
  to_be_deleted: <Trash2Icon />,
  unlinked: <UnlinkIcon />,
}

const INELIGIBLE_TEXT = {
  milestone: "Milestones don't sync with GitHub.",
  template: "Templates don't sync with GitHub.",
  cancelled: "Cancelled tasks don't publish to GitHub.",
  no_project: "Only tasks in a project sync with GitHub.",
} as const

const RETRY_DIRECTION: Record<TaskRetry["direction"], string> = {
  outbound: "To GitHub",
  inbound: "From GitHub",
}

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

  const retry = useFrappePostCall<{ message: TaskGitHub }>(
    "setu.api.github.retry_task_sync"
  )

  const [running, setRunning] = React.useState(false)
  const runningRef = React.useRef(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  // A sync that changed the Task from GitHub shows on the rest of the page too.
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

  /** One retry at a time, its refusal shown below. */
  async function retryNow() {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setActionError(null)
    try {
      await mutate(await retry.call({ task }), { revalidate: false })
      void revalidate(taskActivityKey(task))
    } catch (failure) {
      setActionError(frappeErrorMessage(failure as FrappeError))
      // A refusal usually means the state moved on: show the current one.
      void mutate()
    } finally {
      runningRef.current = false
      setRunning(false)
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
            {link.pending && !link.retries.length ? " · Syncing…" : ""}
          </p>
          {link.uncertain ? (
            <p className="text-sm leading-5">
              A request to create its Issue didn't get an answer. Envision looks
              for that Issue on GitHub before trying again, so it never creates
              two.
            </p>
          ) : null}
          {link.retries.map((job) => (
            <RetryStatus key={job.direction} job={job} link={link} />
          ))}
          {isActiveLink(link.state) ? (
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

      {actions.retry ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => void retryNow()}
          >
            <RefreshCwIcon className={cn(running && "animate-spin")} />
            {running ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : null}
    </RailGroup>
  )
}

/** A Retry Job row: its latest failure, and when it is tried again. */
function RetryStatus({ job, link }: { job: TaskRetry; link: TaskLink }) {
  return (
    <div className="flex flex-col gap-0.5">
      {job.error ? (
        <p className="text-sm leading-5 text-destructive">{job.error}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {RETRY_DIRECTION[job.direction]}
        {job.attempts
          ? ` · Tried ${job.attempts} time${job.attempts === 1 ? "" : "s"}`
          : ""}
        {" · "}
        {job.running ? (
          "Retrying now"
        ) : link.pending ? (
          <NextRetry value={job.next_retry_at} />
        ) : (
          "Waiting for sync"
        )}
      </p>
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
