import * as React from "react"
import { CheckIcon, LoaderCircleIcon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import {
  EditorCollapseButton,
  EditorDoneButton,
} from "@/components/app-ui/editor-panel"
import {
  PromptDialogContent,
  PromptDialogFooter,
  PromptDialogHeader,
} from "@/components/app-ui/prompt-dialog"
import { SectionExpandButton } from "@/components/app-ui/section-actions"
import { HotkeyText } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import type { AutosaveStatus, ConflictChoice } from "@/lib/autosave"
import { bindingKey, getBinding, type CommandId } from "@/lib/commands"
import { cn } from "@/lib/utils"

// Loaded lazily because the editor is the largest dependency in the app.
const DescriptionEditor = React.lazy(
  () => import("@/components/create-project/description-editor")
)

// What the three record pages share (Paper: 06d — Milestone Detail, 07d —
// Module Detail, 09 — Task Detail): the record's own content in a centred
// column (title, description, related lists, comments), and a 340px rail of
// its properties on the right, closed by its activity log. Every property
// saves on its own (lib/autosave); only the description has a Save button.

/**
 * The page under the header: the content column and the properties rail, each
 * scrolling on its own. Below `lg` the rail drops under the content.
 */
export function DetailLayout({
  children,
  rail,
}: {
  children: React.ReactNode
  rail: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="flex min-w-0 flex-col items-center px-6 pt-10 pb-16 sm:px-14 lg:flex-1 lg:overflow-y-auto">
        <div className="flex w-full max-w-190 flex-col gap-10">{children}</div>
      </div>
      <aside
        aria-label="Properties and activity"
        className="flex shrink-0 flex-col gap-5 border-t px-6 py-8 lg:w-85 lg:overflow-y-auto lg:border-t-0 lg:border-l"
      >
        {rail}
      </aside>
    </div>
  )
}

/** One block of the rail; every block after the first sits under a rule. */
export function RailGroup({
  label,
  className,
  children,
}: {
  /** The rail's small heading ("Properties"), on its first block. */
  label?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col not-first:border-t not-first:pt-4",
        className
      )}
    >
      {label ? (
        <h2 className="pb-2 text-xs font-medium text-muted-foreground">
          {label}
        </h2>
      ) : null}
      {children}
    </div>
  )
}

const SAVED_RECENTLY_MS = 60_000

/**
 * What replaces the Save button, beside the record's chip: nothing to do
 * while it reads "Saved", and the one place a failed save says so.
 */
export function SaveIndicator({
  status,
  error,
  savedAt,
  onRetry,
  onResolve,
}: {
  status: AutosaveStatus
  error: string | null
  /** When the last save landed, for "Saved just now". */
  savedAt: number | null
  onRetry: () => void
  /** Settle every field changed here and elsewhere at once. */
  onResolve: (choice: ConflictChoice) => void
}) {
  // "just now" for a minute after a save, then only "Saved".
  const [aged, setAged] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (savedAt === null) return
    const timer = setTimeout(() => setAged(savedAt), SAVED_RECENTLY_MS)
    return () => clearTimeout(timer)
  }, [savedAt])

  return (
    <div
      aria-live="polite"
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
    >
      {status === "saving" ? (
        <>
          <LoaderCircleIcon className="size-3 animate-spin" />
          Saving…
        </>
      ) : status === "saved" ? (
        <>
          <CheckIcon className="size-3" />
          {aged === savedAt ? "Saved" : "Saved just now"}
        </>
      ) : status === "invalid" ? (
        <span className="text-destructive">
          Not saved yet. Fix the marked field.
        </span>
      ) : status === "conflict" ? (
        <>
          <span className="truncate text-destructive">
            Not saved: changed elsewhere
          </span>
          <ConflictActions onResolve={onResolve} />
        </>
      ) : status === "error" ? (
        <>
          <span className="truncate text-destructive" title={error ?? ""}>
            Couldn’t save{error ? `: ${error}` : ""}
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-6 shrink-0 rounded-sm px-2"
            onClick={onRetry}
          >
            Retry
          </Button>
        </>
      ) : (
        "Properties save automatically"
      )}
    </div>
  )
}

/** "Use theirs" or "Keep mine", for edits that collided with someone else's. */
function ConflictActions({
  onResolve,
}: {
  onResolve: (choice: ConflictChoice) => void
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-6 shrink-0 rounded-sm px-2"
        onClick={() => onResolve("theirs")}
      >
        Use theirs
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-6 shrink-0 rounded-sm px-2"
        onClick={() => onResolve("mine")}
      >
        Keep mine
      </Button>
    </>
  )
}

/** The record's chip on the left, how its edits are doing on the right. */
export function KindRow({
  children,
  indicator,
}: {
  children: React.ReactNode
  indicator?: React.ReactNode
}) {
  return (
    <div className="flex min-h-5.5 items-center justify-between gap-4">
      {children}
      {indicator}
    </div>
  )
}

/**
 * The title, which reads as the page's heading; the faint fill on hover and
 * focus is what says it can be edited.
 */
export function TitleInput({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  error,
}: {
  id: string
  name: string
  /** "Task title": the accessible name and the placeholder. */
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  error: string | undefined
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={id}
        name={name}
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        className="-mx-2.5 -my-1 field-sizing-content w-[calc(100%+1.25rem)] max-w-[calc(100%+1.25rem)] min-w-24 truncate rounded-md bg-transparent px-2.5 py-1 text-3xl/9 font-semibold tracking-tight transition-[color,background-color,box-shadow] outline-none hover:bg-foreground/6 focus-visible:bg-foreground/6 focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:ring-3 aria-invalid:ring-destructive/20 supports-[field-sizing:content]:w-auto"
      />
      <FieldError>{error}</FieldError>
    </div>
  )
}

/** The description's own Save: it is the one field that does not autosave. */
export type DescriptionSave = {
  /** The description has edits that are not saved. */
  dirty: boolean
  /** Why its last save failed, while the edits are still unsaved. */
  error: string | null
  onSave: () => Promise<void>
  onDiscard: () => void
}

/** "Unsaved changes", the reason a save failed, Discard and Save. */
function DescriptionSaveBar({
  save,
  saveCommand,
  className,
}: {
  save: DescriptionSave
  saveCommand: CommandId
  className?: string
}) {
  const [saving, setSaving] = React.useState(false)
  if (!save.dirty && !saving) return null
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}
    >
      <span
        aria-live="polite"
        className={cn(
          "me-auto min-w-0 truncate text-xs",
          save.error && !saving ? "text-destructive" : "text-muted-foreground"
        )}
        title={save.error ?? undefined}
      >
        {saving
          ? "Saving…"
          : save.error
            ? `Couldn’t save: ${save.error}`
            : "Unsaved changes"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={saving}
        onClick={save.onDiscard}
      >
        Discard
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          try {
            await save.onSave()
          } finally {
            setSaving(false)
          }
        }}
      >
        {saving ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
        Save
        <HotkeyText command={saveCommand} className="text-xs opacity-70" />
      </Button>
    </div>
  )
}

/**
 * The description: part of the page, with no box around it, and a full-screen
 * writing surface on Expand. Expanding only changes what surrounds the
 * editor, which stays mounted in the same place in the tree, so the draft,
 * the selection and the undo history carry over.
 */
export function DescriptionField({
  value,
  revision,
  conflict,
  onChange,
  onBlur,
  expanded,
  onExpand,
  onCollapse,
  label,
  subtitle,
  toggleCommand,
  collapseCommand,
  saveCommand,
  save,
}: {
  /** The saved HTML; see DescriptionEditor for when it is read. */
  value: string
  /** Moves when the description was replaced from outside. */
  revision: number
  /**
   * Set while the description was changed elsewhere as it was being written:
   * the edit waits until one version is picked.
   */
  conflict: ((choice: ConflictChoice) => void) | null
  onChange: (html: string) => void
  onBlur: () => void
  expanded: boolean
  onExpand: () => void
  onCollapse: () => void
  /** "Task description": the editor's name and the expanded heading. */
  label: string
  /** "Fix state management · Task", under the expanded heading. */
  subtitle: string
  toggleCommand: CommandId
  collapseCommand: CommandId
  /** Saves the description (and any other edit); shown on the Save button. */
  saveCommand: CommandId
  save: DescriptionSave
}) {
  return (
    <section
      aria-label={label}
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col bg-background"
          : "flex flex-col gap-2"
      }
      onKeyDownCapture={(event) => {
        // ProseMirror claims every Escape, so the document-level hotkey may
        // never see one pressed in the editor. Handle it here first, unless
        // one of the editor's own popups (link dialog, "/" menu) is open and
        // should take it instead.
        if (
          expanded &&
          event.key === "Escape" &&
          bindingKey(getBinding(collapseCommand)) === "Escape" &&
          !document.querySelector("[data-richtext-portal]")
        ) {
          event.preventDefault()
          onCollapse()
        }
      }}
    >
      {expanded ? (
        <header className="flex shrink-0 items-center justify-between gap-4 border-b px-8 py-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">{label}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <EditorCollapseButton command={toggleCommand} onClick={onCollapse} />
        </header>
      ) : (
        // Named like the Comments below it, with Expand always in reach.
        <div className="flex h-7 items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">Description</h2>
          <SectionExpandButton command={toggleCommand} onClick={onExpand} />
        </div>
      )}

      {conflict ? (
        <div
          role="alert"
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm",
            expanded && "mx-8 mt-4 shrink-0"
          )}
        >
          <span className="me-auto">
            Someone changed this description while you were writing. Yours isn’t
            saved yet.
          </span>
          <ConflictActions onResolve={conflict} />
        </div>
      ) : null}

      <div className={expanded ? "flex min-h-0 flex-1 flex-col" : ""}>
        <React.Suspense
          fallback={
            expanded ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 px-12 py-10">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            ) : (
              <Skeleton className="h-24 rounded-lg" />
            )
          }
        >
          <DescriptionEditor
            value={value}
            revision={revision}
            onChange={onChange}
            onBlur={onBlur}
            expanded={expanded}
            plain
            label={label}
          />
        </React.Suspense>
      </div>

      {expanded ? null : (
        <DescriptionSaveBar save={save} saveCommand={saveCommand} />
      )}

      {expanded ? (
        <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-8 py-5">
          <span className="text-xs text-muted-foreground">
            <HotkeyText command={collapseCommand} /> to return
          </span>
          <div className="flex min-w-0 items-center gap-3">
            <DescriptionSaveBar save={save} saveCommand={saveCommand} />
            {save.dirty ? null : <EditorDoneButton onClick={onCollapse} />}
          </div>
        </footer>
      ) : null}
    </section>
  )
}

/**
 * Leaving while the last edits could not be saved (an invalid field, or the
 * server refused). A save that works never shows this.
 */
export function UnsavedEditsDialog({
  leaving,
  record,
  reason,
  saving,
  conflict = false,
  description = false,
}: {
  leaving: {
    stay: () => void
    discard: () => void
    retry: () => Promise<void>
  } | null
  /** The record's title. */
  record: string
  /** Why the save failed, when the server said. */
  reason: string | null
  saving: boolean
  /** The edits are held because someone changed the same fields elsewhere. */
  conflict?: boolean
  /** The description has edits its Save button has not sent. */
  description?: boolean
}) {
  return (
    <Dialog
      open={leaving !== null}
      onOpenChange={(next, details) => {
        if (next) return
        if (saving) {
          details.cancel()
          return
        }
        leaving?.stay()
      }}
    >
      <PromptDialogContent>
        <PromptDialogHeader
          title={<>Your last edits to {record} aren’t saved</>}
          description={
            conflict
              ? "Someone changed the same fields elsewhere while you were editing. Keep editing to choose which version to keep, or leave without yours."
              : (reason ??
                (description
                  ? "The description has changes you haven’t saved. Save them, keep editing, or leave without them."
                  : "A field needs fixing before they can be saved. Keep editing to fix it, or leave without them."))
          }
        />
        <PromptDialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="sm:me-auto"
            disabled={saving}
            onClick={() => leaving?.stay()}
          >
            Keep editing
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            disabled={saving}
            onClick={() => leaving?.discard()}
          >
            Leave without saving
          </Button>
          {reason || (description && !conflict) ? (
            <ActionButton
              type="button"
              size="lg"
              disabled={saving}
              onClick={() => void leaving?.retry()}
            >
              {saving ? "Saving…" : reason ? "Try again" : "Save and leave"}
            </ActionButton>
          ) : null}
        </PromptDialogFooter>
      </PromptDialogContent>
    </Dialog>
  )
}
