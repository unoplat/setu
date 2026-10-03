import * as React from "react"
import { useStore } from "@tanstack/react-form"

import {
  DatesProperty,
  ProjectProperty,
  Property,
} from "@/components/detail-properties"
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
import { dueHint, type MilestoneDetail } from "@/lib/milestones"

import { AssigneeCombobox } from "./assignee-combobox"
import { DatePicker } from "./date-picker"
import {
  createMilestoneFormOptions,
  validateDateOrder,
  validateDueDate,
  validateMilestoneTitle,
  visibleError,
  withForm,
} from "./form"
import {
  MilestoneKind,
  MilestoneProgress,
  MilestoneStatus,
} from "./milestone-detail"

// Paper: 06d — Milestone Detail, editable. The title and the description are
// the page; the assignee and the dates are pickers in the rail, above the
// Status and progress the linked Tasks decide. There is no Save: each field's
// `listeners` send its edit (lib/autosave), a picker at once and typing after
// a pause.

export const MilestoneForm = withForm({
  ...createMilestoneFormOptions,
  props: {
    milestone: {} as MilestoneDetail,
    project: "",
    projectName: "",
    listeners: {} as AutosaveListeners,
    status: "idle" as AutosaveStatus,
    /** Moves when the description was replaced from outside. */
    descriptionRevision: 0,
    /** Set while the description was changed elsewhere as it was written. */
    descriptionConflict: null as ((choice: ConflictChoice) => void) | null,
    /** How the edits are doing, shown beside the milestone's chip. */
    indicator: null as React.ReactNode,
    expanded: false,
    onExpand: () => {},
    onCollapse: () => {},
    /** Enter in the title: save now. */
    onSubmit: () => {},
    /** What follows the description: linked tasks, then the comments. */
    footer: null as React.ReactNode,
    /** What closes the rail: the activity log. */
    activity: null as React.ReactNode,
  },
  render: function MilestoneFormView({
    form,
    milestone,
    project,
    projectName,
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
    // Either date's message, under the pair: the order is checked on the
    // start date, and the due date is required.
    const datesError = useStore(form.store, (s) => {
      const { start_date: start, due_date: due } = s.fieldMeta
      return (
        (start ? visibleError(start) : undefined) ??
        (due ? visibleError(due) : undefined)
      )
    })

    return (
      <DetailLayout
        rail={
          <>
            <RailGroup label="Properties">
              <dl className="flex flex-col">
                <MilestoneStatus progress={milestone.progress} />
                <Property label="Assignee" htmlFor="milestone-assignee">
                  <form.Field name="assignee" listeners={listeners.picked}>
                    {(field) => (
                      <AssigneeCombobox
                        id="milestone-assignee"
                        variant="inline"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        current={milestone.assignee}
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
                  hint={
                    dueDate && milestone.progress < 100
                      ? dueHint(dueDate)
                      : null
                  }
                  start={
                    <form.Field
                      name="start_date"
                      listeners={listeners.picked}
                      validators={{
                        // Re-checked whenever either date changes, and
                        // reported against the start date, as on 06a.
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
                          id="milestone-start-date"
                          variant="range"
                          label="Start date"
                          placeholder="Start"
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          invalid={Boolean(visibleError(field.state.meta))}
                          defaultMonth={dueDate}
                          maxDate={dueDate}
                        />
                      )}
                    </form.Field>
                  }
                  due={
                    <form.Field
                      name="due_date"
                      listeners={listeners.picked}
                      validators={{
                        onChange: ({ value }) => validateDueDate(value),
                      }}
                    >
                      {(field) => (
                        <DatePicker
                          id="milestone-due-date"
                          variant="range"
                          label="Due date"
                          placeholder="Due"
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          required
                          invalid={Boolean(visibleError(field.state.meta))}
                          defaultMonth={startDate}
                          minDate={startDate}
                        />
                      )}
                    </form.Field>
                  }
                />
                <ProjectProperty projectName={projectName} />
              </dl>
            </RailGroup>

            <MilestoneProgress project={project} milestone={milestone} />

            {activity}
          </>
        }
      >
        <form
          noValidate
          aria-label="Milestone"
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
              <MilestoneKind name={milestone.name} />
            </KindRow>
            <form.Field
              name="subject"
              listeners={listeners.typed}
              validators={{
                onChange: ({ value }) => validateMilestoneTitle(value),
              }}
            >
              {(field) => (
                <TitleInput
                  id="milestone-title"
                  name="subject"
                  label="Milestone title"
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
                label="Milestone description"
                subtitle={`${milestone.subject} · Milestone`}
                toggleCommand="milestone.toggleDescription"
                collapseCommand="milestone.collapseDescription"
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
