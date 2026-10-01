import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { FlagIcon, LayoutGridIcon, XIcon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { AssigneeCombobox } from "@/components/milestones/assignee-combobox"
import { DatePicker } from "@/components/milestones/date-picker"
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
import { formatDay, useMilestones } from "@/lib/milestones"
import { useModules } from "@/lib/modules"

import {
  MISSING_TITLE,
  createState,
  createTaskFormOptions,
  submitOnce,
  validateDateOrder,
  validateTaskTitle,
  visibleError,
  withForm,
} from "./form"
import { LinkCombobox } from "./link-combobox"
import { PrioritySelect, StatusSelect } from "./task-selects"
import { TagsCombobox } from "./tags-combobox"

// Loaded lazily because the editor is the largest dependency in the app.
const DescriptionEditor = React.lazy(
  () => import("@/components/create-project/description-editor")
)

// Paper: 03 — Create Task, with the Milestone (06e) and Module (07e) pickers.

const requiredMark = (
  <span aria-hidden="true" className="text-destructive">
    *
  </span>
)

export const CreateTaskForm = withForm({
  ...createTaskFormOptions,
  props: {
    project: "",
    projectName: "",
    error: null as string | null,
  },
  render: function CreateTaskFormView({ form, project, projectName, error }) {
    const subject = useSelector(form.store, (state) => state.values.subject)
    const startDate = useSelector(
      form.store,
      (state) => state.values.start_date
    )
    const dueDate = useSelector(form.store, (state) => state.values.due_date)
    const canSubmit = useSelector(form.store, (state) => state.canSubmit)
    const submitting = useSelector(form.store, (state) => state.isSubmitting)
    const state = createState({ subject, canSubmit, submitting })

    const milestones = useMilestones(project)
    const modules = useModules(project)
    const milestoneOptions = React.useMemo(
      () =>
        (milestones.data?.message ?? []).map((milestone) => ({
          value: milestone.name,
          label: milestone.subject,
          detail: milestone.due_date
            ? `Due ${formatDay(milestone.due_date)}`
            : "No due date",
        })),
      [milestones.data]
    )
    const moduleOptions = React.useMemo(
      () =>
        (modules.data?.message ?? []).map((module) => ({
          value: module.name,
          label: module.module_name,
          detail: module.lead
            ? `Lead · ${module.lead.full_name || module.lead.name}`
            : "No lead",
        })),
      [modules.data]
    )

    return (
      <form
        noValidate
        className="flex min-h-0 flex-1 flex-col"
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
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <SheetTitle className="text-2xl font-semibold tracking-tight">
              Create task
            </SheetTitle>
            <SheetDescription>
              Capture the outcome, owner, and dates the team needs to begin.
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

        {/* Room for the focus rings, which the scroll box would clip. */}
        <FieldGroup className="-mx-1 min-h-0 flex-1 gap-5 overflow-y-auto px-1 pt-8 pb-6">
          <form.Field
            name="subject"
            validators={{
              onChange: ({ value }) => validateTaskTitle(value),
            }}
          >
            {(field) => {
              const fieldError = visibleError(field.state.meta)
              return (
                <Field
                  className="gap-2"
                  data-invalid={fieldError ? true : undefined}
                >
                  <FieldLabel htmlFor="task-subject">
                    Task title
                    {requiredMark}
                  </FieldLabel>
                  <Input
                    id="task-subject"
                    name="subject"
                    placeholder="Prepare release checklist"
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
              <Field className="gap-2">
                <div className="flex items-center gap-2">
                  <FieldLabel id="task-description-label">
                    Description
                  </FieldLabel>
                  <span className="text-xs text-muted-foreground">
                    Optional
                  </span>
                </div>
                <React.Suspense
                  fallback={<Skeleton className="h-37 rounded-xl" />}
                >
                  <DescriptionEditor
                    value={field.state.value}
                    onChange={(html) => field.handleChange(html)}
                    onBlur={field.handleBlur}
                    expanded={false}
                    label="Task description"
                  />
                </React.Suspense>
              </Field>
            )}
          </form.Field>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <form.Field
              name="start_date"
              validators={{
                // Re-checked whenever either date changes, and reported
                // against the start date, as on a milestone.
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
                    <FieldLabel htmlFor="task-start-date">
                      Start date
                    </FieldLabel>
                    <DatePicker
                      id="task-start-date"
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

            <form.Field name="due_date">
              {(field) => (
                <Field className="gap-2">
                  <FieldLabel htmlFor="task-due-date">Due date</FieldLabel>
                  <DatePicker
                    id="task-due-date"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    defaultMonth={startDate}
                    minDate={startDate}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="status">
              {(field) => (
                <Field className="gap-2">
                  <FieldLabel htmlFor="task-status">Status</FieldLabel>
                  <StatusSelect
                    id="task-status"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="priority">
              {(field) => (
                <Field className="gap-2">
                  <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                  <PrioritySelect
                    id="task-priority"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="assignee">
              {(field) => (
                <Field className="gap-2">
                  <FieldLabel htmlFor="task-assignee">Assignee</FieldLabel>
                  <AssigneeCombobox
                    id="task-assignee"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="milestone">
              {(field) => (
                <Field className="gap-2">
                  <FieldLabel htmlFor="task-milestone">Milestone</FieldLabel>
                  <LinkCombobox
                    id="task-milestone"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    options={milestoneOptions}
                    loading={milestones.isLoading}
                    icon={<FlagIcon />}
                    noneLabel="No milestone"
                    searchPlaceholder="Search milestones"
                    emptyText="No milestone matches."
                    footer="New milestones are made from the Milestones page."
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="tags">
              {(field) => (
                <Field className="gap-2">
                  <FieldLabel htmlFor="task-tags">Tags</FieldLabel>
                  <TagsCombobox
                    id="task-tags"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="module">
              {(field) => (
                <Field className="gap-2">
                  <FieldLabel htmlFor="task-module">Module</FieldLabel>
                  <LinkCombobox
                    id="task-module"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    options={moduleOptions}
                    loading={modules.isLoading}
                    icon={<LayoutGridIcon />}
                    noneLabel="No module"
                    searchPlaceholder="Search modules"
                    emptyText="No module matches."
                    footer="New modules are made from the Modules page."
                  />
                </Field>
              )}
            </form.Field>
          </div>

          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>

        <footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t pt-6">
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <span className="truncate text-[13px] leading-4.5 font-medium">
              Adds to {projectName}
            </span>
            <span className="text-xs text-muted-foreground" aria-live="polite">
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
            {submitting ? "Creating…" : "Create task"}
          </Button>
        </footer>
      </form>
    )
  },
})

/** The footer's second line: why Create is off, or how to use it. */
function createHint(state: ReturnType<typeof createState>): React.ReactNode {
  if (state === "creating") return "Creating the task…"
  if (state === "incomplete") return MISSING_TITLE
  if (state === "invalid") return "Fix the highlighted field to create."
  return (
    <>
      <HotkeyText command="createTask.submit" /> to create · Esc to close
    </>
  )
}
