import * as React from "react"
import { useStore } from "@tanstack/react-form"
import type { FrappeError } from "frappe-react-sdk"
import { GitMergeIcon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import {
  PromptDialogContent,
  PromptDialogFooter,
  PromptDialogHeader,
  PromptDialogIcon,
} from "@/components/app-ui/prompt-dialog"
import { ReadOnlyDescription } from "@/components/detail-properties"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose } from "@/components/ui/dialog"
import { useScope } from "@/lib/commands"
import { submitOnce, useAppForm } from "@/lib/form"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  CONFLICT_FIELD_LABELS,
  CONFLICT_KIND_TEXT,
  choiceEffect,
  lossLabel,
  remoteStatusLabel,
  type ConflictChoice,
  type SyncConflict,
} from "@/lib/github"
import { statusTitle } from "@/lib/tasks"

const CHOICE_LABELS: Record<ConflictChoice, string> = {
  envision: "Keep Envision",
  github: "Keep GitHub",
}

/**
 * One field's conflict: both versions, what can't be kept exactly, and Keep
 * Envision / Keep GitHub where the server allows it (`allowed_choices`).
 * The choice is recorded with the user; the next sync applies it through
 * the normal Task save, which can still refuse it (open subtasks, say).
 *
 * GitHub's description is Markdown from outside Envision, so it is shown as
 * text and never as HTML. Envision's is the Task's own sanitized HTML, shown
 * through the read-only editor, which keeps only what its schema knows.
 */
export function ConflictDialog({
  conflict,
  onOpenChange,
  canResolve,
  onResolve,
}: {
  /** The conflict under review; null while closed. */
  conflict: SyncConflict | null
  onOpenChange: (open: boolean) => void
  canResolve: boolean
  /** Rejects with the server's refusal, which the dialog shows. */
  onResolve: (choice: ConflictChoice) => Promise<void>
}) {
  const open = conflict !== null
  // Kept while the dialog animates out, after `conflict` is cleared.
  const [shown, setShown] = React.useState<SyncConflict | null>(conflict)
  if (conflict !== null && conflict !== shown) setShown(conflict)

  const [error, setError] = React.useState<string | null>(null)
  const latest = React.useRef({ onResolve, onOpenChange })
  React.useEffect(() => {
    latest.current = { onResolve, onOpenChange }
  })

  const form = useAppForm({
    defaultValues: { choice: null as ConflictChoice | null },
    onSubmit: async ({ value }) => {
      if (!value.choice) return
      setError(null)
      try {
        await latest.current.onResolve(value.choice)
        latest.current.onOpenChange(false)
      } catch (failure) {
        setError(frappeErrorMessage(failure as FrappeError))
      }
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const choosing = useStore(form.store, (state) => state.values.choice)
  useScope("confirm", open)

  function choose(choice: ConflictChoice) {
    if (form.state.isSubmitting) return
    form.setFieldValue("choice", choice)
    void submitOnce(form)
  }

  if (!shown) return null
  const field = CONFLICT_FIELD_LABELS[shown.field]

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
      <PromptDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <PromptDialogHeader
          icon={
            <PromptDialogIcon tone="neutral">
              <GitMergeIcon />
            </PromptDialogIcon>
          }
          title={`${field} conflict`}
          description={CONFLICT_KIND_TEXT[shown.kind]}
        />

        <div className="flex flex-col gap-4">
          <ConflictValue
            side="In Envision"
            conflict={shown}
            value={shown.local_value}
            local
          />
          <ConflictValue
            side="On GitHub"
            conflict={shown}
            value={shown.remote_value}
            local={false}
          />
          {shown.detail.length ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Can't be kept exactly</p>
              <ul className="flex flex-wrap gap-1.5">
                {shown.detail.map((code) => (
                  <li
                    key={code}
                    className="rounded-sm bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {lossLabel(code)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {canResolve ? (
          <ul className="flex flex-col gap-2">
            {shown.allowed_choices.map((choice) => (
              <li
                key={choice}
                className="text-sm leading-5 text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {CHOICE_LABELS[choice]}:
                </span>{" "}
                {choiceEffect(shown, choice)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Someone who can edit this task chooses which version to keep.
          </p>
        )}

        {shown.resolution ? (
          <p role="status" className="text-sm leading-5">
            {CHOICE_LABELS[shown.resolution]} was chosen. It applies at the next
            sync.
          </p>
        ) : null}
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
            {canResolve ? "Cancel" : "Close"}
          </DialogClose>
          {canResolve
            ? shown.allowed_choices.map((choice) => (
                <ActionButton
                  key={choice}
                  type="button"
                  tone="inverse"
                  size="lg"
                  disabled={submitting}
                  focusableWhenDisabled
                  onClick={() => choose(choice)}
                  className="data-disabled:opacity-60"
                >
                  {submitting && choosing === choice
                    ? "Saving choice…"
                    : CHOICE_LABELS[choice]}
                </ActionButton>
              ))
            : null}
        </PromptDialogFooter>
      </PromptDialogContent>
    </Dialog>
  )
}

function ConflictValue({
  side,
  conflict,
  value,
  local,
}: {
  side: string
  conflict: SyncConflict
  value: string
  /** Envision's side, whose description is the Task's sanitized HTML. */
  local: boolean
}) {
  let content: React.ReactNode
  if (conflict.field === "description") {
    content = local ? (
      <ReadOnlyDescription value={value} />
    ) : value.trim() ? (
      <pre className="font-mono text-xs leading-5 wrap-anywhere whitespace-pre-wrap">
        {value}
      </pre>
    ) : (
      <p className="text-sm text-muted-foreground">No description.</p>
    )
  } else if (conflict.field === "status") {
    content = (
      <p className="text-sm">
        {local ? statusTitle(value) : remoteStatusLabel(value)}
      </p>
    )
  } else {
    content = value ? (
      <p className="text-sm wrap-anywhere">{value}</p>
    ) : (
      <p className="text-sm text-muted-foreground">None</p>
    )
  }
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{side}</h3>
      <div className="max-h-72 overflow-y-auto rounded-[12px] border bg-background px-4 py-3">
        {content}
      </div>
    </section>
  )
}
