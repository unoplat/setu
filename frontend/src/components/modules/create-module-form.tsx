import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { CheckIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { AssigneeCombobox } from "@/components/milestones/assignee-combobox"
import { ProjectCombobox } from "@/components/project-combobox"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SheetClose, SheetDescription, SheetTitle } from "@/components/ui/sheet"
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
              <SheetTitle className="text-2xl font-semibold tracking-tight">
                Module description
              </SheetTitle>
              <SheetDescription>
                {moduleName.trim() || "Untitled module"} · Create module
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
                command="createModule.toggleDescription"
                className="text-xs font-normal text-muted-foreground"
              />
            </Button>
          </header>
        ) : (
          <div className="flex shrink-0 items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <SheetTitle className="text-2xl font-semibold tracking-tight">
                Create module
              </SheetTitle>
              <SheetDescription>
                Name a lasting part of the product, choose who leads it, and
                describe what belongs inside.
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
            name="module_name"
            validators={{
              onChange: ({ value }) => validateModuleName(value),
            }}
          >
            {(field) => {
              const fieldError = visibleError(field.state.meta)
              return (
                <Field
                  className={cn("gap-2", expanded && "hidden")}
                  data-invalid={fieldError ? true : undefined}
                >
                  <FieldLabel htmlFor="module-name">
                    Module name
                    {requiredMark}
                  </FieldLabel>
                  <Input
                    id="module-name"
                    name="module_name"
                    placeholder="Payments"
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
                      <FieldLabel id="module-description-label">
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
                        command="createModule.toggleDescription"
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
                    label="Module description"
                  />
                </React.Suspense>
              </Field>
            )}
          </form.Field>

          <form.Field name="lead">
            {(field) => (
              <Field className={cn("gap-2", expanded && "hidden")}>
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
              </Field>
            )}
          </form.Field>

          <form.Field name="project">
            {(field) => (
              <Field className={cn("gap-2", expanded && "hidden")}>
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
              </Field>
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
            <Button
              type="submit"
              size="lg"
              className="px-4.5 font-semibold"
              disabled={state !== "ready"}
            >
              {submitting ? "Creating…" : "Create module"}
            </Button>
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
