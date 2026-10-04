import {
  ActivityIcon,
  BookOpenIcon,
  BugIcon,
  ChartLineIcon,
  ClipboardListIcon,
  CodeIcon,
  FileTextIcon,
  LinkIcon,
  MessageSquareIcon,
  PenToolIcon,
  ServerIcon,
  VideoIcon,
  type LucideIcon,
  type LucideProps,
} from "lucide-react"
import { createElement } from "react"
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { toast } from "sonner"

import type { Assignee } from "@/lib/assignees"

/**
 * A project's links: the "doors" to the tools it lives in outside Envision
 * (docs, videos, dashboards, chat). A link is an Envision Link record, typed
 * by an Envision Link Type (setu/api/link.py). Only the address is stored:
 * Envision never fetches, previews or loads a favicon for it.
 */

/** The lucide icons a link type may wear; the server keeps the same list. */
export const ICON_KEYS = [
  "book-open",
  "video",
  "activity",
  "message-square",
  "pen-tool",
  "code",
  "link",
  "clipboard-list",
  "bug",
  "chart-line",
  "file-text",
  "server",
] as const

export type IconKey = (typeof ICON_KEYS)[number]

export const LINK_ICONS: Record<IconKey, LucideIcon> = {
  "book-open": BookOpenIcon,
  video: VideoIcon,
  activity: ActivityIcon,
  "message-square": MessageSquareIcon,
  "pen-tool": PenToolIcon,
  code: CodeIcon,
  link: LinkIcon,
  "clipboard-list": ClipboardListIcon,
  bug: BugIcon,
  "chart-line": ChartLineIcon,
  "file-text": FileTextIcon,
  server: ServerIcon,
}

/** Readable names for the icon picker's buttons. */
export const ICON_LABELS: Record<IconKey, string> = {
  "book-open": "Book",
  video: "Video",
  activity: "Activity",
  "message-square": "Chat bubble",
  "pen-tool": "Pen",
  code: "Code",
  link: "Link",
  "clipboard-list": "Clipboard",
  bug: "Bug",
  "chart-line": "Chart",
  "file-text": "Document",
  server: "Server",
}

function isIconKey(value: string): value is IconKey {
  return Object.hasOwn(LINK_ICONS, value)
}

/** A type's icon; anything unknown falls back to the plain link. */
export function linkIcon(key: string | null | undefined): LucideIcon {
  return key && isIconKey(key) ? LINK_ICONS[key] : LinkIcon
}

/** A type's icon as an element, for a key only known at render time. */
export function linkIconElement(
  key: string | null | undefined,
  props?: LucideProps
) {
  return createElement(linkIcon(key), { "aria-hidden": true, ...props })
}

/** Copy a link's address, saying whether it worked. */
export async function copyAddress(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success("Address copied")
  } catch {
    toast.error("The address could not be copied.")
  }
}

export interface LinkType {
  /** Equal to `type_name` ("Docs"); sent as a link's `link_type`. */
  name: string
  type_name: string
  icon: string
  /** Built in (Docs, Video, …) rather than created by someone. */
  is_standard: boolean
}

export interface LinkSummary {
  name: string
  link_name: string
  url: string
  /** The address's hostname, lowercased; set by the server. */
  host: string
  /** The rich text editor's HTML, or "" when there is none. */
  description: string
  /** The description's opening words as plain text, for the door. */
  summary: string
  /** Null when its type was deleted out from under it. */
  link_type: LinkType | null
  /** ISO datetimes with their offsets. */
  creation: string
  modified: string
}

/** A link as its detail page needs it (setu.api.link.get_link). */
export interface LinkDetail extends LinkSummary {
  project: string
  project_name: string | null
  owner: string
  added_by: Assignee | null
  /** Whether this user may edit it; read-only viewers get no editor. */
  can_write: boolean
}

/** Shared SWR key so a create can revalidate the board that is on screen. */
export function linksKey(project: string) {
  return ["envision:links", project]
}

/** Oldest first, so a new door joins the end of the board. */
export function useLinks(project: string) {
  return useFrappeGetCall<{ message: LinkSummary[] }>(
    "setu.api.link.list_links",
    { project },
    linksKey(project)
  )
}

export function linkKey(name: string) {
  return ["envision:link", name]
}

export function useLink(name: string) {
  return useFrappeGetCall<{ message: LinkDetail }>(
    "setu.api.link.get_link",
    { name },
    linkKey(name)
  )
}

/** The link's timeline (setu.api.link.get_link_activity). */
export function linkActivityKey(name: string) {
  return ["envision:link-activity", name]
}

/** Workspace-wide: every project offers the same types. */
export const LINK_TYPES_KEY = ["envision:link-types"]

/** Built-ins first, then custom types by name. */
export function useLinkTypes() {
  return useFrappeGetCall<{ message: LinkType[] }>(
    "setu.api.link.list_link_types",
    undefined,
    LINK_TYPES_KEY
  )
}

export function useCreateLink() {
  return useFrappePostCall<{ message: LinkSummary }>(
    "setu.api.link.create_link"
  )
}

export function useUpdateLink() {
  return useFrappePostCall<{ message: LinkDetail }>("setu.api.link.update_link")
}

export function useDeleteLink() {
  return useFrappePostCall<{ message: { name: string; link_name: string } }>(
    "setu.api.link.delete_link"
  )
}

export function useCreateLinkType() {
  return useFrappePostCall<{ message: LinkType }>(
    "setu.api.link.create_link_type"
  )
}

/**
 * The address as it is saved: trimmed, with `https://` in front when no
 * scheme was typed ("grafana.internal/d/x"). The server adds nothing itself.
 */
export function normalizeUrl(value: string): string {
  const text = value.trim()
  if (!text || /^[a-z][a-z\d+.-]*:\/\//i.test(text)) return text
  return `https://${text}`
}

/** The parsed address when it is a web address (http or https), else null. */
function parseWebAddress(value: string): URL | null {
  try {
    const url = new URL(normalizeUrl(value))
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

export function isWebAddress(value: string): boolean {
  return parseWebAddress(value) !== null
}

/** The lowercase hostname, as the server derives `host`; "" when invalid. */
export function hostOf(value: string): string {
  return parseWebAddress(value)?.hostname.toLowerCase() ?? ""
}

/** A host as the board shows it: "loom.com" for "www.loom.com". */
export function displayHost(host: string): string {
  return host.replace(/^www\./, "")
}

/** The built-in types, by the `type_name` the server seeds them with. */
export type BuiltinTypeName =
  | "Docs"
  | "Video"
  | "Observability"
  | "Chat"
  | "Design"
  | "Code"
  | "Link"

// A host matches when one of its labels is a listed name (`www.loom.com`,
// `acme.slack.com`, `grafana.internal`), or it starts with a listed prefix.
const GUESSES: readonly {
  type: Exclude<BuiltinTypeName, "Link">
  labels: readonly string[]
  prefixes?: readonly string[]
}[] = [
  { type: "Video", labels: ["loom", "youtube", "youtu", "vimeo"] },
  {
    type: "Observability",
    labels: ["grafana", "datadog", "datadoghq", "sentry", "newrelic"],
  },
  { type: "Chat", labels: ["slack", "raven", "discord", "teams"] },
  { type: "Design", labels: ["figma"] },
  { type: "Code", labels: ["github", "gitlab", "bitbucket"] },
  {
    type: "Docs",
    labels: ["notion", "confluence", "gitbook"],
    prefixes: ["docs.google."],
  },
]

/**
 * The built-in type an address most likely is, from its host alone. Only a
 * starting point: the person adding the link can pick any type.
 */
export function guessTypeName(host: string): BuiltinTypeName {
  if (!host) return "Link"
  const labels = host.toLowerCase().split(".")
  const guess = GUESSES.find(
    (entry) =>
      entry.labels.some((label) => labels.includes(label)) ||
      entry.prefixes?.some((prefix) => host.startsWith(prefix))
  )
  return guess?.type ?? "Link"
}

/** The type record the guess names, among the types the server has. */
export function guessLinkType(
  host: string,
  types: readonly LinkType[]
): LinkType | undefined {
  const name = guessTypeName(host)
  const byName = (wanted: string) =>
    types.find(
      (type) =>
        type.is_standard &&
        type.type_name.toLocaleLowerCase() === wanted.toLocaleLowerCase()
    )
  return byName(name) ?? byName("Link")
}
