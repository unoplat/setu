import {
  differenceInSeconds,
  format,
  formatDistanceToNowStrict,
} from "date-fns"
import { AtSignIcon, ExternalLinkIcon, GlobeIcon, LockIcon } from "lucide-react"

import { StatusBadge } from "@/components/app-ui/status-badge"
import { parseFrappeDateTime, visibilityLabel } from "@/lib/github"
import { cn } from "@/lib/utils"

// The pieces every GitHub screen repeats: where something goes, who can
// read it there, and when it last happened.

/** A repository's name, opening it on GitHub when its address is known. */
export function RepositoryLink({
  fullName,
  url,
  fallback,
  className,
}: {
  fullName: string | null | undefined
  url: string | null | undefined
  /** Shown when the app no longer lists the repository. */
  fallback: string
  className?: string
}) {
  if (!fullName) {
    return (
      <span className={cn("text-muted-foreground", className)}>{fallback}</span>
    )
  }
  if (!url)
    return <span className={cn("break-all", className)}>{fullName}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 break-all underline-offset-4 hover:underline",
        className
      )}
    >
      {fullName}
      <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="sr-only">(opens GitHub)</span>
    </a>
  )
}

/** Private, Public, or unknown, which publication warnings treat as public. */
export function VisibilityBadge({
  isPrivate,
}: {
  isPrivate: boolean | null | undefined
}) {
  return (
    <StatusBadge
      className={cn(
        isPrivate !== true && "border-destructive/40 text-destructive"
      )}
    >
      {isPrivate === true ? (
        <LockIcon aria-hidden="true" className="size-3" />
      ) : (
        <GlobeIcon aria-hidden="true" className="size-3" />
      )}
      {visibilityLabel(isPrivate)}
    </StatusBadge>
  )
}

/** "5 minutes ago", with the exact time on hover. */
export function GitHubTime({ value }: { value: string }) {
  const date = parseFrappeDateTime(value)
  if (!date) return <span>{value}</span>
  return (
    <time dateTime={date.toISOString()} title={format(date, "PPpp")}>
      {differenceInSeconds(new Date(), date) < 60
        ? "just now"
        : formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  )
}

/** Every publication confirm says this (docs/plans/github-issue-sync.md). */
export function MentionsWarning() {
  return (
    <p className="flex gap-2 text-sm leading-5 text-muted-foreground">
      <AtSignIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        On GitHub, @mentions notify people and #references link Issues. Files
        attached in Envision are never copied.
      </span>
    </p>
  )
}
