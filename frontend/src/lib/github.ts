import { useFrappeGetCall } from "frappe-react-sdk"

export const GITHUB_CONNECTION_KEY = "envision:github:connection"

export interface GitHubInstallation {
  name: string
  account_login: string
  suspended: 0 | 1
  removed: 0 | 1
  last_synced_at: string | null
}

export interface GitHubRepository {
  name: string
  full_name: string
  html_url: string
  private: 0 | 1
  archived: 0 | 1
  has_issues: 0 | 1
  available: 0 | 1
}

export interface ManagedGitHubConnection {
  can_manage: true
  configured: boolean
  app_slug: string | null
  owner_login: string | null
  public_url: string | null
  registered_url: string | null
  url_changed: boolean
  configuration_error: string | null
  installations: GitHubInstallation[]
  repositories: GitHubRepository[]
  /** Project ↔ repository routes that Disconnect would remove. */
  project_routes: number
  /** Task links that Disconnect would keep waiting, Issues and all. */
  sync_links: number
  /** This looks like a restored or copied site: sync stops until confirmed. */
  binding_changed: boolean
  /** Webhook events Issue sync needs that the app is not subscribed to. */
  missing_events: string[]
  last_delivery: {
    name: string
    event: string
    action: string
    status:
      | "Queued"
      | "Processing"
      | "Processed"
      | "Ignored"
      | "Deferred"
      | "Failed"
    error: string | null
    creation: string
  } | null
  callback_urls: {
    redirect: string | null
    setup: string | null
    webhook: string | null
  }
}

export type GitHubConnection = { can_manage: false } | ManagedGitHubConnection

export interface GitHubManifestSubmission {
  url: string
  manifest: Record<string, unknown>
}

export function useGitHubConnection() {
  return useFrappeGetCall<{ message: GitHubConnection }>(
    "setu.api.github.get_connection",
    undefined,
    GITHUB_CONNECTION_KEY,
    { refreshInterval: 10_000 }
  )
}

/** GitHub's manifest registration requires a browser POST, not a fetch. */
export function submitGitHubManifest(submission: GitHubManifestSubmission) {
  const url = new URL(submission.url)
  if (url.origin !== "https://github.com") {
    throw new Error("Unexpected GitHub registration address.")
  }
  const form = document.createElement("form")
  form.method = "POST"
  form.action = url.href
  form.hidden = true
  const input = document.createElement("input")
  input.type = "hidden"
  input.name = "manifest"
  input.value = JSON.stringify(submission.manifest)
  form.append(input)
  document.body.append(form)
  form.submit()
  form.remove()
}

/*
 * Issue sync (docs/adr/0008). The shapes below are what setu.api.github
 * returns; sync itself runs on the server, so these screens only show its
 * state and send the explicit actions.
 */

/** Why a saved route cannot carry Issues now (setu.github.projects). */
export type InactiveReason =
  | "site_binding_changed"
  | "app_not_connected"
  | "site_url_changed"
  | "project_missing"
  | "project_not_enabled"
  | "repository_missing"
  | "repository_unavailable"
  | "repository_archived"
  | "issues_disabled"
  | "installation_removed"
  | "installation_suspended"
  | "installation_not_owned"

/** Why Issues cannot move through a Project's route now. */
export type SyncBlocker = "not_connected" | "sync_not_enabled" | InactiveReason

/** A repository the GitHub App lists, as a Project reader may see it. */
export interface RepositoryDetails {
  /** GitHub's stable repository ID. */
  id: string
  full_name: string
  html_url: string
  private: boolean
  archived: boolean
  has_issues: boolean
  available: boolean
}

/** A routed repository the app no longer lists has only its ID. */
export type ProjectRepository = RepositoryDetails | { id: string }

export function isRepositoryDetails(
  repository: ProjectRepository
): repository is RepositoryDetails {
  return "full_name" in repository
}

export type ActivationImportState = "Queued" | "Running" | "Done" | "Failed"

/** Task links by `sync_state` (setu.github.activation.SyncCounts). */
export interface SyncCounts {
  not_synced: number
  synced: number
  to_be_updated: number
  cron_sync: number
  to_be_deleted: number
  unlinked: number
}

/** setu.api.github.get_project_github, for anyone who can read the Project. */
export interface ProjectGitHub {
  project: string
  /** A System Manager or Projects Manager with write access to the Project. */
  can_manage: boolean
  connected: boolean
  repository: ProjectRepository | null
  routable: boolean
  inactive_reason: InactiveReason | null
  inactive_message: string | null
  sync_enabled: boolean
  blocker: SyncBlocker | null
  blocker_message: string | null
  activated_on: string | null
  activated_by: string | null
  activation_import_state: ActivationImportState | null
  /** Managers only; null for everyone else. */
  last_error: string | null
  /** Managers only; [] for everyone else. */
  missing_events: string[]
  counts: SyncCounts
}

/** The destination as a preview or a Task's route shows it. */
export interface RepositoryView {
  id: string
  full_name: string | null
  html_url: string | null
  /** null when the app no longer lists the repository. */
  private: boolean | null
}

export interface BacklogTask {
  name: string
  subject: string
  parent_task: string | null
  /** Subtasks that would publish with it. */
  subtasks: number
}

/** setu.api.github.preview_project_sync: reads only, calls GitHub not at all. */
export interface SyncPreview {
  project: string
  repository: RepositoryView
  /** The tagged Tasks at the top of each tree that would publish. */
  backlog: BacklogTask[]
  /** Every Task that would publish: the tagged ones and their Subtasks. */
  backlog_count: number
  /** Sent back with Enable; a backlog that changed since is refused. */
  backlog_token: string
  missing_events: string[]
}

export type LinkState =
  | "not_synced"
  | "synced"
  | "to_be_updated"
  | "cron_sync"
  | "to_be_deleted"
  | "unlinked"

/** One of the link's Retry Job rows: work the retry cron owns. */
export interface TaskRetry {
  /** To GitHub (outbound) or from GitHub (inbound). */
  direction: "outbound" | "inbound"
  /** The cron is trying it now. */
  running: boolean
  attempts: number
  next_retry_at: string | null
  /** The latest failure; null for a row that hasn't failed. */
  error: string | null
}

export interface TaskLink {
  state: LinkState
  /** The state in plain words; null when the label says enough. */
  message: string | null
  issue_number: number | null
  issue_url: string | null
  repository_full_name: string | null
  origin: "Envision" | "GitHub" | null
  last_synced_at: string | null
  /** Work that will run without anyone acting; false while sync is stopped. */
  pending: boolean
  /** A create was sent and Envision is checking GitHub for its Issue. */
  uncertain: boolean
  retries: TaskRetry[]
}

export interface TaskRoute {
  connected: boolean
  sync_enabled: boolean
  blocker: SyncBlocker | null
  blocker_message: string | null
  repository: RepositoryView | null
}

export type IneligibleReason =
  | "milestone"
  | "template"
  | "cancelled"
  | "no_project"

/** setu.api.github.get_task_github and every Task action's response. */
export interface TaskGitHub {
  task: string
  tagged: boolean
  eligible: boolean
  ineligible_reason: IneligibleReason | null
  /**
   * A tagged, unlinked Task: a route blocker, or "publishing".
   */
  waiting_reason: SyncBlocker | "publishing" | null
  waiting_message: string | null
  route: TaskRoute
  link: TaskLink | null
  can_write: boolean
  /** Which controls the server allows this user now; show only those. */
  actions: {
    retry: boolean
  }
}

const POLL_MS = 5_000

export function projectGitHubKey(project: string) {
  return ["envision:github:project", project]
}

export function taskGitHubKey(task: string) {
  return ["envision:github:task", task]
}

export function repositoryCandidatesKey(project: string) {
  return ["envision:github:candidates", project]
}

/** Every Task's GitHub state, which a Project-level action can change. */
export function isTaskGitHubKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === taskGitHubKey("")[0]
}

/** Links whose work runs by itself, so it moves on with no one acting. */
export function waitingLinks(counts: SyncCounts): number {
  return counts.not_synced + counts.to_be_updated
}

/** Work the server is still doing, which the screen follows until it ends. */
function projectBusy(view: ProjectGitHub | undefined): boolean {
  return Boolean(
    view &&
    (view.activation_import_state === "Queued" ||
      view.activation_import_state === "Running" ||
      (view.sync_enabled && !view.blocker && waitingLinks(view.counts) > 0))
  )
}

function taskBusy(view: TaskGitHub | undefined): boolean {
  return Boolean(
    view && (view.waiting_reason === "publishing" || view.link?.pending)
  )
}

/** `project` null skips the call, for a closed panel. */
export function useProjectGitHub(project: string | null) {
  return useFrappeGetCall<{ message: ProjectGitHub }>(
    "setu.api.github.get_project_github",
    project ? { project } : undefined,
    project ? projectGitHubKey(project) : null,
    {
      refreshInterval: (latest: { message: ProjectGitHub } | undefined) =>
        projectBusy(latest?.message) ? POLL_MS : 0,
    }
  )
}

/** Managers only: repositories no Project uses yet. */
export function useRepositoryCandidates(project: string | null) {
  return useFrappeGetCall<{ message: RepositoryDetails[] }>(
    "setu.api.github.list_project_repository_candidates",
    project ? { project } : undefined,
    project ? repositoryCandidatesKey(project) : null,
    { revalidateOnMount: true }
  )
}

/**
 * What turning sync on would do. Always fetched fresh when the dialog opens,
 * and not on focus, so the list never changes under the reader's eyes.
 */
export function useSyncPreview(project: string | null) {
  return useFrappeGetCall<{ message: SyncPreview }>(
    "setu.api.github.preview_project_sync",
    project ? { project } : undefined,
    project ? ["envision:github:preview", project] : null,
    { revalidateOnMount: true, revalidateOnFocus: false, dedupingInterval: 0 }
  )
}

/** `task` null skips the call. */
export function useTaskGitHub(task: string | null) {
  return useFrappeGetCall<{ message: TaskGitHub }>(
    "setu.api.github.get_task_github",
    task ? { task } : undefined,
    task ? taskGitHubKey(task) : null,
    {
      refreshInterval: (latest: { message: TaskGitHub } | undefined) =>
        taskBusy(latest?.message) ? POLL_MS : 0,
    }
  )
}

/** Every state but the two marks (links.publishing); a parent in one carries
 *  its new Subtasks to GitHub. */
export function isActiveLink(state: LinkState): boolean {
  return state !== "to_be_deleted" && state !== "unlinked"
}

/** A Project's repository as the publish confirm shows it. */
export function repositoryView(
  repository: ProjectRepository | null
): RepositoryView | null {
  if (!repository) return null
  if (!isRepositoryDetails(repository)) {
    return { id: repository.id, full_name: null, html_url: null, private: null }
  }
  return {
    id: repository.id,
    full_name: repository.full_name,
    html_url: repository.html_url,
    private: repository.private,
  }
}

/** The tag that publishes a Task; matched as the server does (links.py). */
export const GITHUB_TAG = "github"

export function hasGitHubTag(tags: readonly string[]): boolean {
  return tags.some((tag) => tag.trim().toLowerCase() === GITHUB_TAG)
}

export function visibilityLabel(isPrivate: boolean | null | undefined) {
  if (isPrivate === true) return "Private"
  if (isPrivate === false) return "Public"
  return "Visibility unknown"
}

/** Who can read what is published there, for the publication warnings. */
export function audienceText(isPrivate: boolean | null | undefined) {
  if (isPrivate === true) {
    return "It's a private repository: people with access to it on GitHub can read it."
  }
  if (isPrivate === false) {
    return "It's a public repository: anyone on the internet can read it."
  }
  return "Envision can't confirm whether this repository is private. Treat it as public."
}

export const LINK_STATE_LABELS: Record<LinkState, string> = {
  not_synced: "Not on GitHub yet",
  synced: "Synced",
  to_be_updated: "Update waiting",
  cron_sync: "Retrying",
  to_be_deleted: "Deleting",
  unlinked: "Unlinked",
}

/**
 * GitHub sync times arrive as ISO with the site's offset
 * ("2026-10-24T12:30:00.123456+05:30", setu.github.clock.site_iso). Not every
 * browser reads more than three fractional digits, so they are trimmed.
 */
export function parseFrappeDateTime(value: string): Date | null {
  const date = new Date(value.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1"))
  return Number.isNaN(date.getTime()) ? null : date
}
