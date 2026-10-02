import * as React from "react"

import { Property } from "@/components/detail-properties"
import { AssigneeCombobox } from "@/components/milestones/assignee-combobox"
import { ProjectCombobox } from "@/components/project-combobox"
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
import type { ModuleDetail } from "@/lib/modules"

import {
  createModuleFormOptions,
  validateModuleName,
  visibleError,
  withForm,
} from "./form"
import { ModuleKind, ModuleProgress } from "./module-detail"

// Paper: 07d — Module Detail, editable. The name and the description are the
// page; the lead and the project are pickers in the rail, above the progress
// its Tasks decide. There is no Save: each field's `listeners` send its edit
// (lib/autosave), a picker at once and typing after a pause.

export const ModuleForm = withForm({
  ...createModuleFormOptions,
  props: {
    module: {} as ModuleDetail,
    projectName: "",
    listeners: {} as AutosaveListeners,
    status: "idle" as AutosaveStatus,
    /** Moves when the description was replaced from outside. */
    descriptionRevision: 0,
    /** Set while the description was changed elsewhere as it was written. */
    descriptionConflict: null as ((choice: ConflictChoice) => void) | null,
    /** How the edits are doing, shown beside the module's chip. */
    indicator: null as React.ReactNode,
    expanded: false,
    onExpand: () => {},
    onCollapse: () => {},
    /** Enter in the name: save now. */
    onSubmit: () => {},
    /** What follows the description: the module's tasks, then the comments. */
    footer: null as React.ReactNode,
    /** What closes the rail: the activity log. */
    activity: null as React.ReactNode,
  },
  render: function ModuleFormView({
    form,
    module,
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
    return (
      <DetailLayout
        rail={
          <>
            <RailGroup label="Properties">
              <dl className="flex flex-col">
                <Property label="Lead" htmlFor="module-lead">
                  <form.Field name="lead" listeners={listeners.picked}>
                    {(field) => (
                      <AssigneeCombobox
                        id="module-lead"
                        variant="inline"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        current={module.lead}
                        emptyLabel="No lead"
                      />
                    )}
                  </form.Field>
                </Property>
                <Property label="Project" htmlFor="module-project">
                  <form.Field name="project" listeners={listeners.picked}>
                    {(field) => (
                      <ProjectCombobox
                        id="module-project"
                        variant="inline"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        current={{
                          name: module.project,
                          project_name: module.project_name ?? projectName,
                        }}
                      />
                    )}
                  </form.Field>
                </Property>
              </dl>
            </RailGroup>

            <ModuleProgress module={module} />

            {activity}
          </>
        }
      >
        <form
          noValidate
          aria-label="Module"
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
              <ModuleKind />
            </KindRow>
            <form.Field
              name="module_name"
              listeners={listeners.typed}
              validators={{
                onChange: ({ value }) => validateModuleName(value),
              }}
            >
              {(field) => (
                <TitleInput
                  id="module-title"
                  name="module_name"
                  label="Module name"
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
                label="Module description"
                subtitle={`${module.module_name} · Module`}
                toggleCommand="module.toggleDescription"
                collapseCommand="module.collapseDescription"
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
