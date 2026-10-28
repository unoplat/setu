import { GitBranchIcon } from "lucide-react"

import {
  ConfirmDialog,
  ConfirmFooter,
  ConfirmHeader,
} from "@/components/confirm-dialog"
import {
  MentionsWarning,
  RepositoryLink,
  VisibilityBadge,
} from "@/components/github/github-parts"
import { audienceText, type RepositoryView } from "@/lib/github"

/**
 * Publishing copies a Task's title and description to GitHub, possibly
 * publicly (docs/plans/github-issue-sync.md §7). Adding the `github` tag,
 * at creation or later, is how a person starts it here; it first shows
 * where it goes, who can read it there, and that
 * mentions notify people. The server publishes; this only asks first.
 */

/** Where a Task would publish. */
export interface PublishTarget {
  /** null when it could not be loaded; the confirm says so. */
  repository: RepositoryView | null
  /** Subtasks that publish with it, as far as this page knows. */
  subtasks: number
}

export function PublishToGitHubDialog({
  open,
  onOpenChange,
  target,
  label,
  pendingLabel,
  creating = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: PublishTarget | null
  label: string
  pendingLabel: string
  /** In Create Task: it publishes once the task is created. */
  creating?: boolean
  /** Rejects with the server's refusal, which the dialog shows. */
  onConfirm: () => Promise<void>
}) {
  const repository = target?.repository ?? null
  const subtasks = target?.subtasks ?? 0
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    >
      <ConfirmHeader
        tone="neutral"
        icon={<GitBranchIcon />}
        title="Publish to GitHub?"
        description={
          creating
            ? "When you create this task, a GitHub Issue gets its title, description and status, and the two stay in sync."
            : "A GitHub Issue gets this task's title, description and status, and the two stay in sync."
        }
      />
      <div className="flex flex-col gap-2 rounded-[12px] border bg-background px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <RepositoryLink
            fullName={repository?.full_name}
            url={repository?.html_url}
            fallback="Envision couldn't load this project's repository."
          />
          <VisibilityBadge isPrivate={repository?.private} />
        </div>
        <p className="text-sm leading-5 text-muted-foreground">
          {audienceText(repository?.private)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm leading-5">
          {subtaskText(subtasks)} Removing the github tag doesn't stop sync.
        </p>
        <MentionsWarning />
      </div>
      <ConfirmFooter
        tone="neutral"
        label={label}
        pendingLabel={pendingLabel}
        ready
      />
    </ConfirmDialog>
  )
}

function subtaskText(subtasks: number): string {
  if (subtasks === 1) {
    return "Its subtask publishes with it as a sub-issue, and so do subtasks added later."
  }
  if (subtasks > 1) {
    return `Its ${subtasks} subtasks publish with it as sub-issues, and so do subtasks added later.`
  }
  return "Subtasks added under it later publish too, as sub-issues."
}

/**
 * Create Task's line about GitHub: "subtask" when its parent's Issue syncs
 * (a Subtask publishes with it, tagged or not), "tagged" when the github
 * tag will publish it, "backlog" when the tag waits for sync to be turned on.
 */
export function CreatePublishNotice({
  kind,
  repository,
}: {
  kind: "subtask" | "tagged" | "backlog"
  repository: RepositoryView | null
}) {
  if (kind === "backlog") {
    return (
      <p className="text-sm leading-5 text-muted-foreground" role="status">
        The github tag publishes this task once a manager turns on GitHub sync
        for this project and reviews the tagged tasks.
      </p>
    )
  }
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border bg-muted/40 px-4 py-3"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5">
        <GitBranchIcon aria-hidden="true" className="size-3.5 shrink-0" />
        {kind === "subtask"
          ? "Publishes to GitHub with its parent, as a sub-issue in"
          : "Publishes to GitHub when created, in"}
        <RepositoryLink
          fullName={repository?.full_name}
          url={repository?.html_url}
          fallback="the project's repository"
          className="font-medium"
        />
        <VisibilityBadge isPrivate={repository?.private} />
      </p>
      <MentionsWarning />
    </div>
  )
}
