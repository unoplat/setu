import * as React from "react"
import { useStore } from "@tanstack/react-form"
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
import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog"
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { useCommand } from "@/lib/commands"

import {
  createProjectFormOptions,
  submitOnce,
  validateProjectName,
  withForm,
} from "./form"

// Loaded lazily because the editor is the largest dependency in the app.
const DescriptionEditor = React.lazy(() => import("./description-editor"))

// Paper: "Create Project Dialog" (01 — Create Project Details) and "Expanded
// Description". Both are layouts of this one form: expanding swaps the chrome
// around the description, while the fields and the editor stay mounted in the
// same place in the tree, so the draft, the selection and the undo history
// carry over.

export const CreateProjectForm = withForm({
  ...createProjectFormOptions,
  props: {
    expanded: false,
    error: null as string | null,
    onExpand: () => {},
    onCollapse: () => {},
  },
  render: function CreateProjectFormView({
    form,
    expanded,
    error,
    onExpand,
    onCollapse,
  }) {
    const projectName = useStore(
      form.store,
      (state) => state.values.project_name
    )
    const submitting = useStore(form.store, (state) => state.isSubmitting)

    // The expanded layout only edits the draft; the project is created from
    // the compact one.
    useCommand("createProject.submitStep", () => void submitOnce(form), {
      enabled: !expanded,
    })

    return (
      <form
        className={expanded ? "flex min-h-0 flex-1 flex-col" : "grid gap-7"}
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
              <PanelTitle surface="dialog">Project description</PanelTitle>
              <DialogDescription>
                {projectName.trim() || "Untitled project"} · Create a project
              </DialogDescription>
            </div>
            <EditorCollapseButton
              command="createProject.toggleDescription"
              onClick={onCollapse}
            />
          </header>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="gap-2">
              <PanelTitle surface="dialog">Create a project</PanelTitle>
              <DialogDescription>
                Name the work and add enough context to get started.
              </DialogDescription>
            </DialogHeader>
            <DialogClose render={<PanelCloseButton />} disabled={submitting}>
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        )}

        <FieldGroup className={expanded ? "min-h-0 flex-1 gap-0" : "gap-5"}>
          <form.Field
            name="project_name"
            validators={{
              onSubmit: ({ value }) => validateProjectName(value),
            }}
          >
            {(field) => {
              const error = field.state.meta.errors.find(
                (item): item is string => typeof item === "string"
              )
              return (
                <CompactField
                  className={expanded ? "hidden" : undefined}
                  data-invalid={error ? true : undefined}
                >
                  <FieldLabel htmlFor="project-name">
                    Project name
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  </FieldLabel>
                  <FieldInput
                    id="project-name"
                    name="project_name"
                    placeholder="Mobile App"
                    autoComplete="off"
                    autoFocus
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={error ? true : undefined}
                  />
                  <FieldError>{error}</FieldError>
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
                      <FieldLabel id="project-description-label">
                        Description
                      </FieldLabel>
                      <span className="text-xs text-muted-foreground">
                        Optional
                      </span>
                    </div>
                    <EditorExpandButton
                      command="createProject.toggleDescription"
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
                      <Skeleton className="h-22 rounded-xl" />
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
              </CompactField>
            )}
          </form.Field>
          {error && !expanded ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>

        {expanded ? (
          <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-8 py-5">
            <div className="flex flex-col gap-1">
              <span className="text-sm">
                Changes stay in your project draft
              </span>
              <span className="text-xs text-muted-foreground">
                <HotkeyText command="createProject.collapseDescription" /> to
                return to the form · Your project isn’t created yet
              </span>
            </div>
            <EditorDoneButton onClick={onCollapse} />
          </footer>
        ) : (
          <DialogFooter className="gap-2.5">
            <DialogClose
              render={<Button variant="outline" size="lg" />}
              disabled={submitting}
            >
              Cancel
            </DialogClose>
            <ActionButton type="submit" size="lg" disabled={submitting}>
              Create project
            </ActionButton>
          </DialogFooter>
        )}
      </form>
    )
  },
})
