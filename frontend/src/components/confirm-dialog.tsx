import * as React from "react"
import { useStore } from "@tanstack/react-form"
import type { FrappeError } from "frappe-react-sdk"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useScope } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { submitOnce, useAppForm } from "@/lib/form"
import { cn } from "@/lib/utils"

/**
 * Paper: Milestone Delete 02, Module Delete 02, Task Archive 02. One confirm
 * for deleting or archiving a record: what happens, the one number that
 * matters ("3 linked tasks stay, with no milestone"), Cancel and the action.
 *
 * - The dialog is opened from a ⋯ menu, so its `open` state lives beside the
 *   menu, not in it, and focus returns to the ⋯ button (`finalFocus`) since
 *   the menu item is gone by then.
 *   https://base-ui.com/react/components/dialog
 * - `children` is the body. Base UI unmounts a closed popup, so the body's
 *   count (lib/confirm-count) is fetched only while the confirm is open.
 * - TanStack Form runs the action: `isSubmitting` is the pending state and
 *   `submitOnce` keeps Enter twice from sending it twice. The server's refusal
 *   is kept beside the form rather than in its error map, where it would
 *   leave `canSubmit` false and the action could not be tried again.
 *   https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling
 * - While the action runs nothing closes the dialog: not Escape, not Cancel.
 */

export type ConfirmTone = "destructive" | "neutral"

interface ConfirmState {
  submitting: boolean
  error: string | null
  submit: () => void
  confirmRef: React.RefObject<HTMLButtonElement | null>
}

const ConfirmContext = React.createContext<ConfirmState | null>(null)

function useConfirm(): ConfirmState {
  const state = React.useContext(ConfirmContext)
  if (!state) throw new Error("Confirm parts belong inside <ConfirmDialog>.")
  return state
}

export function ConfirmDialog({
  open,
  onOpenChange,
  finalFocus,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where focus goes once it closes: the ⋯ button that opened the menu. */
  finalFocus?: React.RefObject<HTMLElement | null>
  /** Delete or archive, then move on. Throws when the server refuses. */
  onConfirm: () => Promise<void>
  children: React.ReactNode
}) {
  const [error, setError] = React.useState<string | null>(null)
  const confirmRef = React.useRef<HTMLButtonElement>(null)
  const latest = React.useRef({ onConfirm, onOpenChange })
  React.useEffect(() => {
    latest.current = { onConfirm, onOpenChange }
  })

  const form = useAppForm({
    defaultValues: {},
    onSubmit: async () => {
      setError(null)
      try {
        await latest.current.onConfirm()
        latest.current.onOpenChange(false)
      } catch (failure) {
        setError(frappeErrorMessage(failure as FrappeError))
      }
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  useScope("confirm", open)

  const state = React.useMemo<ConfirmState>(
    () => ({
      submitting,
      error,
      submit: () => void submitOnce(form),
      confirmRef,
    }),
    [submitting, error, form]
  )

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
        if (!next) setError(null)
      }}
    >
      <DialogContent
        showCloseButton={false}
        // The action has focus, so Enter confirms, as in the Paper frames.
        initialFocus={confirmRef}
        finalFocus={finalFocus}
        className="gap-6 rounded-3xl p-7 sm:max-w-[480px]"
      >
        <ConfirmContext value={state}>{children}</ConfirmContext>
      </DialogContent>
    </Dialog>
  )
}

export function ConfirmHeader({
  tone,
  icon,
  title,
  description,
}: {
  tone: ConfirmTone
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <DialogHeader className="gap-3.5">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-[12px] [&_svg]:size-4.5",
          tone === "destructive"
            ? "bg-destructive/12 text-destructive"
            : "bg-muted text-foreground"
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-2">
        <DialogTitle className="text-[22px] leading-7.5 font-semibold tracking-tight wrap-anywhere">
          {title}
        </DialogTitle>
        <DialogDescription className="leading-5.5">
          {description}
        </DialogDescription>
      </div>
    </DialogHeader>
  )
}

/**
 * The count, and nothing more: a list of what is affected would make the
 * confirm a page to read. `text` is undefined until the count has arrived.
 */
export function ConfirmImpact({
  icon,
  text,
  error,
  onRetry,
}: {
  icon: React.ReactNode
  text: string | undefined
  error: FrappeError | undefined
  onRetry: () => void
}) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-12 items-center gap-3 rounded-[12px] border bg-background px-4 py-3.5"
    >
      <span className="flex w-4.5 shrink-0 [&_svg]:size-4">{icon}</span>
      {error ? (
        <>
          <p className="grow text-sm leading-5 text-destructive">
            {frappeErrorMessage(error)}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-my-1 shrink-0"
            onClick={onRetry}
          >
            Try again
          </Button>
        </>
      ) : text === undefined ? (
        <>
          <Skeleton className="h-4 w-52" />
          <span className="sr-only">Counting…</span>
        </>
      ) : (
        <p className="grow text-sm leading-5 font-medium">{text}</p>
      )}
    </div>
  )
}

export function ConfirmFooter({
  tone,
  label,
  pendingLabel,
  ready,
}: {
  tone: ConfirmTone
  label: string
  pendingLabel: string
  /** Whether the count has arrived; the action waits for it. */
  ready: boolean
}) {
  const { submitting, error, submit, confirmRef } = useConfirm()
  return (
    <>
      {error ? (
        <p role="alert" className="-mt-2 text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2.5 pt-1">
        <DialogClose
          disabled={submitting}
          render={<Button type="button" variant="outline" size="lg" />}
        >
          Cancel
          <span className="text-xs font-normal text-muted-foreground">Esc</span>
        </DialogClose>
        <Button
          ref={confirmRef}
          type="button"
          size="lg"
          // Still focusable while waiting, so Enter works once the count is in.
          disabled={!ready || submitting}
          focusableWhenDisabled
          onClick={submit}
          className={cn(
            "px-4.5 font-semibold text-background data-disabled:opacity-60",
            tone === "destructive"
              ? "bg-destructive hover:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/30"
              : "bg-foreground hover:bg-foreground/90 focus-visible:border-foreground focus-visible:ring-foreground/20"
          )}
        >
          {submitting ? pendingLabel : label}
        </Button>
      </DialogFooter>
    </>
  )
}
