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
  /** Syncing Task links that Disconnect would pause (never delete). */
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
export type SyncBlocker =
  | "not_connected"
  | "sync_not_enabled"
  | "sync_paused"
  | InactiveReason

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

export interface SyncCounts {
  /** Links that sync now: Pending, Synced, Conflict and Error. */
  linked: number
  pending: number
  conflict: number
  error: number
  paused: number
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
  paused: boolean
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
  labelled_import: boolean
}

export type LinkState =
  | "Pending"
  | "Synced"
  | "Conflict"
  | "Error"
  | "Paused"
  | "Disconnected"
  | "Tombstoned"

export type PauseReason =
  | "user_paused"
  | "backlog_held"
  | "route_cleared"
  | "app_disconnected"
  | "project_changed"
  | "task_ineligible"
  | "transferred"
  | "remote_deleted"
  | "access_lost"
  | "destination_changed"

export type ConflictField = "title" | "description" | "status" | "parent"

export type ConflictKind =
  | "both_changed"
  | "lossy_outbound"
  | "lossy_inbound"
  | "too_long"
  | "title_too_long"
  | "remote_reopened"
  | "closed_not_planned"
  | "closed_while_blocked"

export type ConflictChoice = "envision" | "github"

export interface SyncConflict {
  field: ConflictField
  kind: ConflictKind
  /** Loss codes (docs/github-description-fidelity.md) for a description. */
  detail: string[]
  /**
   * Envision's value. For a description it is the Task's own sanitized
   * HTML; GitHub's is raw Markdown and is only ever shown as text.
   */
  local_value: string
  remote_value: string
  allowed_choices: ConflictChoice[]
  detected_on: string | null
  /** A choice already made, waiting for the next sync to apply it. */
  resolution: ConflictChoice | null
}

export interface TaskLink {
  state: LinkState
  paused_reason: PauseReason | null
  message: string | null
  issue_number: number | null
  issue_url: string | null
  repository_full_name: string | null
  origin: "Envision" | "GitHub" | null
  last_synced_at: string | null
  /** Work that will run without anyone acting; 0 while paused or blocked. */
  pending_operations: number
  /** A create was sent and Envision is checking GitHub for its Issue. */
  uncertain: boolean
  error: string | null
  hierarchy_error: string | null
  conflicts: SyncConflict[]
}

export interface TaskRoute {
  connected: boolean
  sync_enabled: boolean
  paused: boolean
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
  /** A tagged, unlinked Task: a route blocker, or "publishing". */
  waiting_reason: SyncBlocker | "publishing" | null
  waiting_message: string | null
  route: TaskRoute
  link: TaskLink | null
  can_write: boolean
  /** Which controls the server allows this user now; show only those. */
  actions: {
    publish: boolean
    retry: boolean
    pause: boolean
    resume: boolean
    disconnect: boolean
    resolve: boolean
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

/** Work the server is still doing, which the screen follows until it ends. */
function projectBusy(view: ProjectGitHub | undefined): boolean {
  return Boolean(
    view &&
    (view.activation_import_state === "Queued" ||
      view.activation_import_state === "Running" ||
      (view.sync_enabled &&
        !view.paused &&
        !view.blocker &&
        view.counts.pending > 0))
  )
}

function taskBusy(view: TaskGitHub | undefined): boolean {
  return Boolean(
    view &&
    (view.waiting_reason === "publishing" ||
      (view.link && (view.link.pending_operations > 0 || view.link.uncertain)))
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

/** States whose work runs (store.ACTIVE_STATES); a parent in one carries
 *  its new Subtasks to GitHub. */
const ACTIVE_LINK_STATES: readonly LinkState[] = [
  "Pending",
  "Synced",
  "Conflict",
  "Error",
]

export function isActiveLink(state: LinkState): boolean {
  return ACTIVE_LINK_STATES.includes(state)
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
  Pending: "Pending",
  Synced: "Synced",
  Conflict: "Conflict",
  Error: "Error",
  Paused: "Paused",
  Disconnected: "Disconnected",
  Tombstoned: "Deleted",
}

export const CONFLICT_FIELD_LABELS: Record<ConflictField, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  parent: "Parent",
}

/** What happened, in a sentence, for each kind of conflict. */
export const CONFLICT_KIND_TEXT: Record<ConflictKind, string> = {
  both_changed: "Changed differently in Envision and on GitHub.",
  lossy_outbound:
    "Envision's description can't be published exactly: GitHub would lose some of it, or lose what only the Issue has.",
  lossy_inbound:
    "GitHub's description has formatting Envision can't show exactly.",
  too_long: "Envision's description is too long for a GitHub Issue.",
  title_too_long: "GitHub's title is longer than Envision allows.",
  remote_reopened: "The Issue was reopened on GitHub, but this task is Done.",
  closed_not_planned:
    "The Issue was closed on GitHub as not planned or a duplicate.",
  closed_while_blocked:
    "The Issue was closed on GitHub while this task is Blocked.",
}

/** What each choice does, where it is more than "use that side's value". */
export function choiceEffect(
  conflict: Pick<SyncConflict, "field" | "kind">,
  choice: ConflictChoice
): string {
  const field = CONFLICT_FIELD_LABELS[conflict.field].toLowerCase()
  if (conflict.field === "status") {
    if (conflict.kind === "remote_reopened") {
      return choice === "github"
        ? "Reopens this task in Envision."
        : "Closes the Issue on GitHub again."
    }
    if (
      conflict.kind === "closed_not_planned" ||
      conflict.kind === "closed_while_blocked"
    ) {
      return choice === "github"
        ? "Marks this task Done. Refused if it still has open subtasks."
        : "Reopens the Issue on GitHub; the task keeps its status."
    }
  }
  if (conflict.kind === "title_too_long" && choice === "github") {
    return "Uses GitHub's whole title. What doesn't fit the task title continues at the top of its description."
  }
  if (conflict.kind === "lossy_outbound" && choice === "envision") {
    return "Replaces the Issue's description. What's listed above is lost on GitHub."
  }
  if (conflict.kind === "lossy_inbound" && choice === "github") {
    return "Replaces this task's description. What's listed above is lost in Envision."
  }
  return choice === "envision"
    ? `Replaces the Issue's ${field} with this task's.`
    : `Replaces this task's ${field} with the Issue's.`
}

/** Loss codes from docs/github-description-fidelity.md, as people read them. */
const LOSS_LABELS: Partial<Record<string, string>> = {
  underline: "Underline",
  highlight: "Highlight",
  text_color: "Text colour",
  font: "Font",
  alignment: "Alignment",
  indent: "Indentation",
  line_height: "Line height",
  text_direction: "Text direction",
  image_size: "Image size or float",
  image_transform: "Flipped image",
  table_column_width: "Table column widths",
  subscript: "Subscript",
  superscript: "Superscript",
  task_list: "Checklist",
  mixed_list: "Mixed list",
  details: "Details block",
  columns: "Columns",
  table_header: "Table without a header row",
  table_span: "Merged table cells",
  table_cell_blocks: "Several lines in a table cell",
  table_alignment: "Table column alignment",
  math: "Math",
  unsupported_element: "Unsupported formatting",
  roundtrip_mismatch: "Formatting Markdown can't hold exactly",
  private_attachment: "Attachment (never copied)",
  local_url: "Link to this site",
  inline_data_image: "Embedded image",
  unsupported_url: "Unsupported link",
  body_too_long: "Too long for GitHub",
  heading_level: "Heading level",
  task_item_blocks: "Checklist item with several blocks",
  mixed_task_list: "Checklist mixed with plain items",
  raw_html: "HTML",
  linked_image: "Image inside a link",
  footnote: "Footnote",
  alert: "GitHub alert block",
  sanitizer_removed: "Content removed for safety",
  title_continuation_marker_missing:
    "The title continuation lost its marker or was split. Review the title; description text is preserved.",
}

export function lossLabel(code: string): string {
  return LOSS_LABELS[code] ?? code.replaceAll("_", " ")
}

/** How a conflict's Status value reads ("closed (not_planned)" from GitHub). */
export function remoteStatusLabel(value: string): string {
  const match = /^closed \((\w+)\)$/.exec(value)
  if (match) return `Closed as ${match[1].replaceAll("_", " ")}`
  if (value === "closed") return "Closed"
  if (value === "open") return "Open"
  return value
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
