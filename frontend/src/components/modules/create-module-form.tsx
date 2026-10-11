import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { XIcon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import {
  EditorCollapseButton,
  EditorDoneButton,
  EditorExpandButton,
  PanelCloseButton,
  PanelTitle,
} from "@/components/app-ui/editor-panel"
import { CompactField, FieldInput } from "@/components/app-ui/field-controls"
import { HotkeyText } from "@/components/hotkey-hint"
import { AssigneeCombobox } from "@/components/milestones/assignee-combobox"
import { ProjectCombobox } from "@/components/project-combobox"
import { Button } from "@/components/ui/button"
import {
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { SheetClose, SheetDescription } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjects } from "@/lib/projects"
import { cn } from "@/lib/utils"

import {
  MISSING_NAME,
  MISSING_PROJECT,
  createModuleFormOptions,
  createState,
  submitOnce,
  validateModuleName,
  visibleError,
  withForm,
} from "./form"

// Loaded lazily because the editor is the largest dependency in the app.
const DescriptionEditor = React.lazy(
  () => import("@/components/create-project/description-editor")
)

// Paper: 07a — Create Module and 07b — Expanded Module Description. Both are
// layouts of this one form: expanding swaps the chrome around the
// description and hides the other fields, which stay mounted in the same
// place in the tree, so the draft, the selection and the undo history carry
// over.

const requiredMark = (
  <span aria-hidden="true" className="text-destructive">
    *
  </span>
)

export const CreateModuleForm = withForm({
  ...createModuleFormOptions,
  props: {
    /** The project whose page opened the panel, and its title. */
    project: "",
    projectName: "",
    expanded: false,
    error: null as string | null,
    onExpand: () => {},
    onCollapse: () => {},
  },
  render: function CreateModuleFormView({
    form,
    project,
    projectName,
    expanded,
    error,
    onExpand,
    onCollapse,
  }) {
    const moduleName = useSelector(
      form.store,
      (state) => state.values.module_name
    )
    const target = useSelector(form.store, (state) => state.values.project)
    const submitting = useSelector(form.store, (state) => state.isSubmitting)
    const state = createState({ moduleName, project: target, submitting })
    const { data: projects } = useProjects()
    const targetName =
      projects?.find((item) => item.name === target)?.project_name ??
      (target === project ? projectName : target)

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
              <PanelTitle surface="sheet">Module description</PanelTitle>
              <SheetDescription>
                {moduleName.trim() || "Untitled module"} · Create module
              </SheetDescription>
            </div>
            <EditorCollapseButton
              command="createModule.toggleDescription"
              onClick={onCollapse}
            />
          </header>
        ) : (
          <div className="flex shrink-0 items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <PanelTitle surface="sheet">Create module</PanelTitle>
              <SheetDescription>
                Name a lasting part of the product, choose who leads it, and
                describe what belongs inside.
              </SheetDescription>
            </div>
            <SheetClose render={<PanelCloseButton />} disabled={submitting}>
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
            name="module_name"
            validators={{
              onChange: ({ value }) => validateModuleName(value),
            }}
          >
            {(field) => {
              const fieldError = visibleError(field.state.meta)
              return (
                <CompactField
                  className={expanded ? "hidden" : undefined}
                  data-invalid={fieldError ? true : undefined}
                >
                  <FieldLabel htmlFor="module-name">
                    Module name
                    {requiredMark}
                  </FieldLabel>
                  <FieldInput
                    id="module-name"
                    name="module_name"
                    placeholder="Payments"
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
              <CompactField className={expanded ? "min-h-0 flex-1" : undefined}>
                {expanded ? null : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FieldLabel id="module-description-label">
                        Description
                      </FieldLabel>
                      <span className="text-xs text-muted-foreground">
                        Optional
                      </span>
                    </div>
                    <EditorExpandButton
                      command="createModule.toggleDescription"
                      disabled={submitting}
                      onClick={onExpand}
                    />
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
                    label="Module description"
                  />
                </React.Suspense>
              </CompactField>
            )}
          </form.Field>

          <form.Field name="lead">
            {(field) => (
              <CompactField className={expanded ? "hidden" : undefined}>
                <FieldLabel htmlFor="module-lead">Lead</FieldLabel>
                <AssigneeCombobox
                  id="module-lead"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  emptyLabel="No lead"
                />
                <FieldDescription className="text-[13px]">
                  Who the team goes to about this area. Optional.
                </FieldDescription>
              </CompactField>
            )}
          </form.Field>

          <form.Field name="project">
            {(field) => (
              <CompactField className={expanded ? "hidden" : undefined}>
                <FieldLabel htmlFor="module-project">
                  Project
                  {requiredMark}
                </FieldLabel>
                <ProjectCombobox
                  id="module-project"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  current={{ name: project, project_name: projectName }}
                />
                <FieldDescription className="text-[13px]">
                  The product this module is a part of.
                </FieldDescription>
              </CompactField>
            )}
          </form.Field>

          {error && !expanded ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>

        {expanded ? (
          <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-8 py-5">
            <div className="flex flex-col gap-1">
              <span className="text-sm">Changes stay in your module draft</span>
              <span className="text-xs text-muted-foreground">
                <HotkeyText command="createModule.collapseDescription" /> to
                return to the form · Your module isn’t created yet
              </span>
            </div>
            <EditorDoneButton onClick={onCollapse} />
          </footer>
        ) : (
          <footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t pt-6">
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <span className="truncate text-[13px] leading-4.5 font-medium">
                Adds to {targetName}
              </span>
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {createHint(state, target)}
              </span>
            </div>
            <SheetClose
              render={<Button variant="outline" size="lg" />}
              disabled={submitting}
            >
              Cancel
            </SheetClose>
            <ActionButton type="submit" size="lg" disabled={state !== "ready"}>
              {submitting ? "Creating…" : "Create module"}
            </ActionButton>
          </footer>
        )}
      </form>
    )
  },
})

/** The footer's second line: why Create is off, or how to use it. */
function createHint(
  state: ReturnType<typeof createState>,
  project: string
): React.ReactNode {
  if (state === "creating") return "Creating the module…"
  if (state === "incomplete") return project ? MISSING_NAME : MISSING_PROJECT
  return (
    <>
      <HotkeyText command="createModule.submit" /> to create · Esc to close
    </>
  )
}
