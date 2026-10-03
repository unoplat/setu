import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { CheckIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SheetClose, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { AssigneeCombobox } from "./assignee-combobox"
import { DatePicker } from "./date-picker"
import {
  MISSING_DETAILS,
  createMilestoneFormOptions,
  createState,
  submitOnce,
  validateDateOrder,
  validateDueDate,
  validateMilestoneTitle,
  visibleError,
  withForm,
} from "./form"

// Loaded lazily because the editor is the largest dependency in the app.
const DescriptionEditor = React.lazy(
  () => import("@/components/create-project/description-editor")
)

// Paper: 06a — Create Milestone and 06b — Expanded Milestone Description.
// Both are layouts of this one form: expanding swaps the chrome around the
// description and hides the other fields, which stay mounted in the same
// place in the tree, so the draft, the selection and the undo history carry
// over.

const requiredMark = (
  <span aria-hidden="true" className="text-destructive">
    *
  </span>
)

export const CreateMilestoneForm = withForm({
  ...createMilestoneFormOptions,
  props: {
    projectName: "",
    expanded: false,
    error: null as string | null,
    onExpand: () => {},
    onCollapse: () => {},
  },
  render: function CreateMilestoneFormView({
    form,
    projectName,
    expanded,
    error,
    onExpand,
    onCollapse,
  }) {
    const subject = useSelector(form.store, (state) => state.values.subject)
    const dueDate = useSelector(form.store, (state) => state.values.due_date)
    const startDate = useSelector(
      form.store,
      (state) => state.values.start_date
    )
    const canSubmit = useSelector(form.store, (state) => state.canSubmit)
    const submitting = useSelector(form.store, (state) => state.isSubmitting)
    const state = createState({ subject, dueDate, canSubmit, submitting })

    return (
      <form
        noValidate
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          expanded && "overflow-hidden"
        )}
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          // Some of the editor package's controls are plain <button>s, which
          // default to type="submit" inside a form.
          const { submitter } = event.nativeEvent as SubmitEvent
          if (submitter?.closest(".envision-rte")) return
          void submitOnce(form)
        }}
      >
        {expanded ? (
          <header className="flex shrink-0 items-center justify-between gap-4 border-b px-8 py-6">
            <div className="flex flex-col gap-1.5">
              <SheetTitle className="text-2xl font-semibold tracking-tight">
                Milestone description
              </SheetTitle>
              <SheetDescription>
                {subject.trim() || "Untitled milestone"} · Create milestone
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9.5 gap-2 rounded-full px-3"
              onClick={onCollapse}
            >
              <Minimize2Icon />
              Collapse
              <HotkeyText
                command="createMilestone.toggleDescription"
                className="text-xs font-normal text-muted-foreground"
              />
            </Button>
          </header>
        ) : (
          <div className="flex shrink-0 items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <SheetTitle className="text-2xl font-semibold tracking-tight">
                Create milestone
              </SheetTitle>
              <SheetDescription>
                Name the checkpoint, set the dates it spans, and describe what
                done looks like.
              </SheetDescription>
            </div>
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-me-1 -mt-1 bg-secondary"
                />
              }
              disabled={submitting}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </SheetClose>
          </div>
        )}

        <FieldGroup
          className={
            expanded
              ? "min-h-0 flex-1 gap-0"
              : // Room for the focus rings, which the scroll box would clip.
                "-mx-1 min-h-0 flex-1 gap-5 overflow-y-auto px-1 pt-8 pb-6"
          }
        >
          <form.Field
            name="subject"
            validators={{
              onChange: ({ value }) => validateMilestoneTitle(value),
            }}
          >
            {(field) => {
              const fieldError = visibleError(field.state.meta)
              return (
                <Field
                  className={cn("gap-2", expanded && "hidden")}
                  data-invalid={fieldError ? true : undefined}
                >
                  <FieldLabel htmlFor="milestone-subject">
                    Milestone title
                    {requiredMark}
                  </FieldLabel>
                  <Input
                    id="milestone-subject"
                    name="subject"
                    placeholder="Beta build ready"
                    autoComplete="off"
                    autoFocus
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={fieldError ? true : undefined}
                    className="h-11 rounded-xl"
                  />
                  <FieldError>{fieldError}</FieldError>
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <Field className={expanded ? "min-h-0 flex-1 gap-0" : "gap-2"}>
                {expanded ? null : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FieldLabel id="milestone-description-label">
                        Description
                      </FieldLabel>
                      <span className="text-xs text-muted-foreground">
                        Optional
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-7 gap-1.5 rounded-md px-2"
                      disabled={submitting}
                      onClick={onExpand}
                    >
                      <Maximize2Icon className="size-3.5" />
                      Expand
                      <HotkeyText
                        command="createMilestone.toggleDescription"
                        className="font-normal text-muted-foreground"
                      />
                    </Button>
                  </div>
                )}
                <React.Suspense
                  fallback={
                    expanded ? (
                      <div className="flex min-h-0 flex-1 flex-col gap-4 px-12 py-10">
                        <Skeleton className="h-8 w-1/3" />
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-5 w-1/2" />
                      </div>
                    ) : (
                      <Skeleton className="h-37 rounded-xl" />
                    )
                  }
                >
                  <DescriptionEditor
                    value={field.state.value}
                    onChange={(html) => field.handleChange(html)}
                    onBlur={field.handleBlur}
                    expanded={expanded}
                  />
                </React.Suspense>
              </Field>
            )}
          </form.Field>

          <div
            className={cn(
              "grid gap-x-4 gap-y-5 sm:grid-cols-2",
              expanded && "hidden"
            )}
          >
            <form.Field
              name="start_date"
              validators={{
                // Guardrail "Missing details": re-checked whenever either
                // date changes, and reported against the start date.
                onChangeListenTo: ["due_date"],
                onChange: ({ value, fieldApi }) =>
                  validateDateOrder(
                    value,
                    fieldApi.form.getFieldValue("due_date")
                  ),
              }}
            >
              {(field) => {
                const fieldError = visibleError(field.state.meta)
                return (
                  <Field
                    className="gap-2"
                    data-invalid={fieldError ? true : undefined}
                  >
                    <FieldLabel htmlFor="milestone-start-date">
                      Start date
                    </FieldLabel>
                    <DatePicker
                      id="milestone-start-date"
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      invalid={Boolean(fieldError)}
                      defaultMonth={dueDate}
                      maxDate={dueDate}
                    />
                    <FieldError>{fieldError}</FieldError>
                  </Field>
                )
              }}
            </form.Field>

            <form.Field
              name="due_date"
              validators={{
                onChange: ({ value }) => validateDueDate(value),
              }}
            >
              {(field) => {
                const fieldError = visibleError(field.state.meta)
                return (
                  <Field
                    className="gap-2"
                    data-invalid={fieldError ? true : undefined}
                  >
                    <FieldLabel htmlFor="milestone-due-date">
                      Due date
                      {requiredMark}
                    </FieldLabel>
                    <DatePicker
                      id="milestone-due-date"
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      required
                      invalid={Boolean(fieldError)}
                      defaultMonth={startDate}
                      minDate={startDate}
                    />
                    <FieldError>{fieldError}</FieldError>
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="assignee">
              {(field) => (
                <Field className="gap-2 sm:col-span-2">
                  <FieldLabel htmlFor="milestone-assignee">Assignee</FieldLabel>
                  <AssigneeCombobox
                    id="milestone-assignee"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>
          </div>

          {error && !expanded ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>

        {expanded ? (
          <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-8 py-5">
            <div className="flex flex-col gap-1">
              <span className="text-sm">
                Changes stay in your milestone draft
              </span>
              <span className="text-xs text-muted-foreground">
                <HotkeyText command="createMilestone.collapseDescription" /> to
                return to the form · Your milestone isn’t created yet
              </span>
            </div>
            <Button
              type="button"
              size="lg"
              className="gap-3 px-5 font-semibold"
              onClick={onCollapse}
            >
              Done
              <CheckIcon />
            </Button>
          </footer>
        ) : (
          <footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t pt-6">
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <span className="truncate text-[13px] leading-4.5 font-medium">
                Adds to {projectName}
              </span>
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {createHint(state)}
              </span>
            </div>
            <SheetClose
              render={<Button variant="outline" size="lg" />}
              disabled={submitting}
            >
              Cancel
            </SheetClose>
            <Button
              type="submit"
              size="lg"
              className="px-4.5 font-semibold"
              disabled={state !== "ready"}
            >
              {submitting ? "Creating…" : "Create milestone"}
            </Button>
          </footer>
        )}
      </form>
    )
  },
})

/** The footer's second line: why Create is off, or how to use it. */
function createHint(state: ReturnType<typeof createState>): React.ReactNode {
  if (state === "creating") return "Creating the milestone…"
  if (state === "incomplete") return MISSING_DETAILS
  if (state === "invalid") return "Fix the highlighted field to create."
  return (
    <>
      <HotkeyText command="createMilestone.submit" /> to create · Esc to close
    </>
  )
}
