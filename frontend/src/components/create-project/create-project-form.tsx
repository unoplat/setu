import * as React from "react"
import { useStore } from "@tanstack/react-form"
import { CheckIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCommand } from "@/lib/commands"
import { cn } from "@/lib/utils"

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
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                Project description
              </DialogTitle>
              <DialogDescription>
                {projectName.trim() || "Untitled project"} · Create a project
              </DialogDescription>
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
                command="createProject.toggleDescription"
                className="text-xs font-normal text-muted-foreground"
              />
            </Button>
          </header>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                Create a project
              </DialogTitle>
              <DialogDescription>
                Name the work and add enough context to get started.
              </DialogDescription>
            </DialogHeader>
            <DialogClose
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
                <Field
                  className={cn("gap-2", expanded && "hidden")}
                  data-invalid={error ? true : undefined}
                >
                  <FieldLabel htmlFor="project-name">
                    Project name
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  </FieldLabel>
                  <Input
                    id="project-name"
                    name="project_name"
                    placeholder="Mobile App"
                    autoComplete="off"
                    autoFocus
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={error ? true : undefined}
                    className="h-11 rounded-xl"
                  />
                  <FieldError>{error}</FieldError>
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
                      <FieldLabel id="project-description-label">
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
                        command="createProject.toggleDescription"
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
              </Field>
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
          <DialogFooter className="gap-2.5">
            <DialogClose
              render={<Button variant="outline" size="lg" />}
              disabled={submitting}
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="lg"
              className="px-4.5 font-semibold"
              disabled={submitting}
            >
              Create project
            </Button>
          </DialogFooter>
        )}
      </form>
    )
  },
})
