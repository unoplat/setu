import * as React from "react"

import {
  PublishToGitHubDialog,
  type PublishTarget,
} from "@/components/github/publish-dialog"
import { hasGitHubTag } from "@/lib/github"

/** A tags field's change, which may first need the publish confirm. */
export type ConfirmTags = (
  current: string[],
  next: string[],
  apply: (tags: string[]) => void
) => void

/** Applies every tag change at once: for forms that need no confirm. */
export const applyTags: ConfirmTags = (_current, next, apply) => apply(next)

interface PendingTags {
  tags: string[]
  apply: (tags: string[]) => void
  target: PublishTarget
}

/**
 * Guards a tags field. Adding `github` when that would publish (`target` is
 * set) opens the confirm; the tag is applied, and so saved, only once
 * confirmed. Every other change applies at once.
 */
export function useGitHubTagConfirm(
  target: PublishTarget | null,
  { creating = false }: { creating?: boolean } = {}
) {
  const [pending, setPending] = React.useState<PendingTags | null>(null)

  const confirmTags = React.useCallback<ConfirmTags>(
    (current, next, apply) => {
      if (target && !hasGitHubTag(current) && hasGitHubTag(next)) {
        setPending({ tags: next, apply, target })
      } else {
        apply(next)
      }
    },
    [target]
  )

  const dialog = (
    <PublishToGitHubDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null)
      }}
      // Kept from when it opened, so a refresh cannot change what was read.
      target={pending?.target ?? target}
      creating={creating}
      label={creating ? "Add tag" : "Add tag and publish"}
      pendingLabel="Adding…"
      onConfirm={() => {
        pending?.apply(pending.tags)
        return Promise.resolve()
      }}
    />
  )

  return { confirmTags, dialog }
}
