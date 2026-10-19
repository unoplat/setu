import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { FlagIcon, LayoutGridIcon, XIcon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import { PanelCloseButton, PanelTitle } from "@/components/app-ui/editor-panel"
import { CompactField, FieldInput } from "@/components/app-ui/field-controls"
import { HotkeyText } from "@/components/hotkey-hint"
import { DatePicker } from "@/components/milestones/date-picker"
import { Button } from "@/components/ui/button"
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { SheetClose, SheetDescription } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDay, useMilestones } from "@/lib/milestones"
import { useModules } from "@/lib/modules"
import { useProjectTasks } from "@/lib/tasks"

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
import { AssigneesCombobox } from "./assignees-combobox"
import { LinkCombobox } from "./link-combobox"
import { ParentTaskCombobox } from "./parent-task-combobox"
import { PrioritySelect, StatusSelect } from "./task-selects"
import { TagsCombobox } from "./tags-combobox"

// Loaded lazily because the editor is the largest dependency in the app.
const DescriptionEditor = React.lazy(
  () => import("@/components/create-project/description-editor")
)

// Paper: 03 — Create Task, with the Milestone (06e) and Module (07e) pickers,
// and 09m — Create subtask, the same form with a Parent task field first.

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
    /** Opened from a Task's Subtasks (09m): the Parent task field shows. */
    withParent: false,
  },
  render: function CreateTaskFormView({
    form,
    project,
    projectName,
    error,
    withParent,
  }) {
    const subject = useSelector(form.store, (state) => state.values.subject)
    const status = useSelector(form.store, (state) => state.values.status)
    const parentTask = useSelector(
      form.store,
      (state) => state.values.parent_task
    )
    // The parent's title for the copy, and its due date, which ERPNext lets
    // no Subtask's pass.
    const { data: projectTasks } = useProjectTasks(project)
    const parent = parentTask
      ? projectTasks?.find((task) => task.name === parentTask)
      : undefined
    const parentDue = parent?.exp_end_date?.slice(0, 10) || undefined
    const subtask = withParent && Boolean(parentTask)
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
            <PanelTitle surface="sheet">
              {subtask ? "Create subtask" : "Create task"}
            </PanelTitle>
            <SheetDescription>
              {subtask
                ? `A full task under ${parent?.subject ?? parentTask}, with its own owner and dates.`
                : "Capture the outcome, owner, and dates the team needs to begin."}
            </SheetDescription>
          </div>
          <SheetClose render={<PanelCloseButton />} disabled={submitting}>
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>

        {/* Room for the focus rings, which the scroll box would clip. */}
        <FieldGroup className="-mx-1 min-h-0 flex-1 gap-5 overflow-y-auto px-1 pt-8 pb-6">
          {withParent ? (
            <form.Field name="parent_task">
              {(field) => (
                <CompactField>
                  <FieldLabel htmlFor="task-parent">Parent task</FieldLabel>
                  <ParentTaskCombobox
                    id="task-parent"
                    project={project}
                    status={status}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </CompactField>
              )}
            </form.Field>
          ) : null}

          <form.Field
            name="subject"
            validators={{
              onChange: ({ value }) => validateTaskTitle(value),
            }}
          >
            {(field) => {
              const fieldError = visibleError(field.state.meta)
              return (
                <CompactField data-invalid={fieldError ? true : undefined}>
                  <FieldLabel htmlFor="task-subject">
                    {subtask ? "Subtask title" : "Task title"}
                    {requiredMark}
                  </FieldLabel>
                  <FieldInput
                    id="task-subject"
                    name="subject"
                    placeholder={
                      subtask
                        ? "Confirm privacy labels"
                        : "Prepare release checklist"
                    }
                    autoComplete="off"
                    autoFocus
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={fieldError ? true : undefined}
                  />
                  <FieldError>{fieldError}</FieldError>
                </CompactField>
              )
            }}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <CompactField>
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
              </CompactField>
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
                  <CompactField data-invalid={fieldError ? true : undefined}>
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
                  </CompactField>
                )
              }}
            </form.Field>

            <form.Field name="due_date">
              {(field) => (
                <CompactField>
                  <FieldLabel htmlFor="task-due-date">Due date</FieldLabel>
                  <DatePicker
                    id="task-due-date"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    defaultMonth={startDate || parentDue}
                    minDate={startDate}
                    maxDate={parentDue}
                  />
                </CompactField>
              )}
            </form.Field>

            <form.Field name="status">
              {(field) => (
                <CompactField>
                  <FieldLabel htmlFor="task-status">Status</FieldLabel>
                  <StatusSelect
                    id="task-status"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </CompactField>
              )}
            </form.Field>

            <form.Field name="priority">
              {(field) => (
                <CompactField>
                  <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                  <PrioritySelect
                    id="task-priority"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </CompactField>
              )}
            </form.Field>

            <form.Field name="assignees">
              {(field) => (
                <CompactField>
                  <FieldLabel htmlFor="task-assignees">Assignees</FieldLabel>
                  <AssigneesCombobox
                    id="task-assignees"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </CompactField>
              )}
            </form.Field>

            <form.Field name="milestone">
              {(field) => (
                <CompactField>
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
                </CompactField>
              )}
            </form.Field>

            <form.Field name="tags">
              {(field) => (
                <CompactField>
                  <FieldLabel htmlFor="task-tags">Tags</FieldLabel>
                  <TagsCombobox
                    id="task-tags"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </CompactField>
              )}
            </form.Field>

            <form.Field name="module">
              {(field) => (
                <CompactField>
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
                </CompactField>
              )}
            </form.Field>
          </div>

          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>

        <footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t pt-6">
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <span className="truncate text-compact font-medium">
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
          <ActionButton type="submit" size="lg" disabled={state !== "ready"}>
            {submitting
              ? "Creating…"
              : subtask
                ? "Create subtask"
                : "Create task"}
          </ActionButton>
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
