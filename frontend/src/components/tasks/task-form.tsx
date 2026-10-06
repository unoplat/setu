import * as React from "react"
import { useStore } from "@tanstack/react-form"
import { FlagIcon, LayoutGridIcon } from "lucide-react"

import { DatesProperty, Property } from "@/components/detail-properties"
import { DatePicker } from "@/components/milestones/date-picker"
import {
  DescriptionField,
  DetailLayout,
  KindRow,
  RailGroup,
  TitleInput,
} from "@/components/record-detail"
import type {
  AutosaveListeners,
  AutosaveStatus,
  ConflictChoice,
} from "@/lib/autosave"
import { dueHint, formatDay, useMilestones } from "@/lib/milestones"
import { useModules } from "@/lib/modules"
import type { TaskDetail } from "@/lib/tasks"

import {
  createTaskFormOptions,
  validateDateOrder,
  validateTaskTitle,
  visibleError,
  withForm,
} from "./form"
import { AssigneesCombobox } from "./assignees-combobox"
import { LinkCombobox } from "./link-combobox"
import { OverdueNote, TaskKind } from "./task-detail"
import { PrioritySelect, StatusSelect } from "./task-selects"
import { TagsCombobox } from "./tags-combobox"

// Paper: 09 — Task Detail (card clicked), editable. The title and the
// description are the page; every other property is a picker in the rail.
// There is no Save: each field's `listeners` send its edit (lib/autosave), a
// picker at once and typing after a pause.

export const TaskForm = withForm({
  ...createTaskFormOptions,
  props: {
    task: {} as TaskDetail,
    project: "",
    listeners: {} as AutosaveListeners,
    status: "idle" as AutosaveStatus,
    /** Moves when the description was replaced from outside. */
    descriptionRevision: 0,
    /** Set while the description was changed elsewhere as it was written. */
    descriptionConflict: null as ((choice: ConflictChoice) => void) | null,
    /** How the edits are doing, shown beside the Task's chip. */
    indicator: null as React.ReactNode,
    expanded: false,
    onExpand: () => {},
    onCollapse: () => {},
    /** Enter in the title: save now. */
    onSubmit: () => {},
    /** What follows the description in the content column: the comments. */
    footer: null as React.ReactNode,
    /** What closes the rail: the activity log. */
    activity: null as React.ReactNode,
  },
  render: function TaskFormView({
    form,
    task,
    project,
    listeners,
    status,
    descriptionRevision,
    descriptionConflict,
    indicator,
    expanded,
    onExpand,
    onCollapse,
    onSubmit,
    footer,
    activity,
  }) {
    const startDate = useStore(form.store, (s) => s.values.start_date)
    const dueDate = useStore(form.store, (s) => s.values.due_date)
    const done = useStore(form.store, (s) => s.values.status === "Completed")
    // The date order is checked on the start date; the rail shows it under
    // the pair.
    const datesError = useStore(form.store, (s) =>
      s.fieldMeta.start_date ? visibleError(s.fieldMeta.start_date) : undefined
    )

    // The same lists the Board and Create Task load, so nothing new is fetched.
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
      <DetailLayout
        rail={
          <>
            <RailGroup label="Properties">
              <dl className="flex flex-col">
                <Property label="Status" htmlFor="task-status">
                  <form.Field name="status" listeners={listeners.picked}>
                    {(field) => (
                      <StatusSelect
                        id="task-status"
                        variant="inline"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                  <OverdueNote status={task.status} />
                </Property>
                <Property label="Priority" htmlFor="task-priority">
                  <form.Field name="priority" listeners={listeners.picked}>
                    {(field) => (
                      <PrioritySelect
                        id="task-priority"
                        variant="inline"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                </Property>
                <Property label="Assignees" htmlFor="task-assignees">
                  <form.Field name="assignees" listeners={listeners.picked}>
                    {(field) => (
                      <AssigneesCombobox
                        id="task-assignees"
                        variant="inline"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        current={task.assignees}
                      />
                    )}
                  </form.Field>
                </Property>
              </dl>
            </RailGroup>

            <RailGroup>
              <dl className="flex flex-col">
                <DatesProperty
                  error={datesError}
                  hint={dueDate && !done ? dueHint(dueDate) : null}
                  start={
                    <form.Field
                      name="start_date"
                      listeners={listeners.picked}
                      validators={{
                        // Re-checked whenever either date changes, and
                        // reported against the start date, as on Create Task.
                        onChangeListenTo: ["due_date"],
                        onChange: ({ value, fieldApi }) =>
                          validateDateOrder(
                            value,
                            fieldApi.form.getFieldValue("due_date")
                          ),
                      }}
                    >
                      {(field) => (
                        <DatePicker
                          id="task-start-date"
                          variant="range"
                          label="Start date"
                          placeholder="Start"
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          invalid={Boolean(datesError)}
                          defaultMonth={dueDate}
                          maxDate={dueDate}
                        />
                      )}
                    </form.Field>
                  }
                  due={
                    <form.Field name="due_date" listeners={listeners.picked}>
                      {(field) => (
                        <DatePicker
                          id="task-due-date"
                          variant="range"
                          label="Due date"
                          placeholder="Due"
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          defaultMonth={startDate}
                          minDate={startDate}
                        />
                      )}
                    </form.Field>
                  }
                />
                <Property label="Milestone" htmlFor="task-milestone">
                  <form.Field name="milestone" listeners={listeners.picked}>
                    {(field) => (
                      <LinkCombobox
                        id="task-milestone"
                        variant="inline"
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
                    )}
                  </form.Field>
                </Property>
                <Property label="Module" htmlFor="task-module">
                  <form.Field name="module" listeners={listeners.picked}>
                    {(field) => (
                      <LinkCombobox
                        id="task-module"
                        variant="inline"
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
                    )}
                  </form.Field>
                </Property>
              </dl>
            </RailGroup>

            <RailGroup className="gap-1.5">
              <label
                htmlFor="task-tags"
                className="text-[13px] text-muted-foreground"
              >
                Tags
              </label>
              <div className="-mx-2">
                <form.Field name="tags" listeners={listeners.picked}>
                  {(field) => (
                    <TagsCombobox
                      id="task-tags"
                      variant="inline"
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </div>
            </RailGroup>

            {activity}
          </>
        }
      >
        <form
          noValidate
          aria-label="Task"
          className="flex flex-col gap-8"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            // Some of the editor package's controls are plain <button>s, which
            // default to type="submit" inside a form.
            const { submitter } = event.nativeEvent as SubmitEvent
            if (submitter?.closest(".envision-rte")) return
            onSubmit()
          }}
        >
          <div className="flex flex-col gap-3">
            <KindRow indicator={indicator}>
              <TaskKind name={task.name} />
            </KindRow>
            <form.Field
              name="subject"
              listeners={listeners.typed}
              validators={{
                onChange: ({ value }) => validateTaskTitle(value),
              }}
            >
              {(field) => (
                <TitleInput
                  id="task-title"
                  name="subject"
                  label="Task title"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  error={visibleError(field.state.meta)}
                />
              )}
            </form.Field>
          </div>

          <form.Field name="description" listeners={listeners.typed}>
            {(field) => (
              <DescriptionField
                value={field.state.value}
                revision={descriptionRevision}
                conflict={descriptionConflict}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                expanded={expanded}
                onExpand={onExpand}
                onCollapse={onCollapse}
                label="Task description"
                subtitle={`${task.subject} · Task`}
                toggleCommand="task.toggleDescription"
                collapseCommand="task.collapseDescription"
                status={status}
              />
            )}
          </form.Field>
        </form>
        {footer}
      </DetailLayout>
    )
  },
})
