import * as React from "react"
import { useStore } from "@tanstack/react-form"
import { CheckIcon, Maximize2Icon, Minimize2Icon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { bindingKey, getBinding } from "@/lib/commands"
import { cn } from "@/lib/utils"

import {
  SAVE_STATUS,
  projectSettingsFormOptions,
  submitOnce,
  validateProjectName,
  withForm,
  type SaveState,
} from "./form"

// Loaded lazily because the editor is the largest dependency in the app.
const DescriptionEditor = React.lazy(
  () => import("@/components/create-project/description-editor")
)

// Paper: "General Section" of 05 — Project Settings, and the same expanded
// description layout as the Create Project dialog. Expanding covers the page
// with the full editor while the fields stay mounted in the same place in
// the tree, so the edits, the selection and the undo history carry over.

const EMPTY_VALUES = { project_name: "", description: "" }

export const ProjectSettingsForm = withForm({
  ...projectSettingsFormOptions(EMPTY_VALUES),
  props: {
    /** The saved name, for the expanded layout's subtitle. */
    projectName: "",
    state: "pristine" as SaveState,
    expanded: false,
    error: null as string | null,
    onExpand: () => {},
    onCollapse: () => {},
  },
  render: function ProjectSettingsFormView({
    form,
    projectName,
    state,
    expanded,
    error,
    onExpand,
    onCollapse,
  }) {
    const submitting = useStore(form.store, (s) => s.isSubmitting)

    return (
      <form
        className={
          expanded
            ? "fixed inset-0 z-50 flex flex-col bg-background"
            : "flex flex-col"
        }
        aria-label={expanded ? "Project description" : undefined}
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          // Some of the editor package's controls are plain <button>s, which
          // default to type="submit" inside a form.
          const { submitter } = event.nativeEvent as SubmitEvent
          if (submitter?.closest(".envision-rte")) return
          void submitOnce(form)
        }}
        onKeyDownCapture={(event) => {
          // ProseMirror claims every Escape, so the document-level hotkey
          // may never see one pressed in the editor. Handle it here first,
          // unless one of the editor's own popups (link dialog, "/" menu) is
          // open and should take it instead.
          if (
            expanded &&
            event.key === "Escape" &&
            bindingKey(getBinding("projectSettings.collapseDescription")) ===
              "Escape" &&
            !document.querySelector("[data-richtext-portal]")
          ) {
            event.preventDefault()
            onCollapse()
          }
        }}
      >
        {expanded ? (
          <header className="flex shrink-0 items-center justify-between gap-4 border-b px-8 py-6">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">
                Project description
              </h2>
              <p className="text-sm text-muted-foreground">
                {projectName} · Project settings
              </p>
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
                command="projectSettings.toggleDescription"
                className="text-xs font-normal text-muted-foreground"
              />
            </Button>
          </header>
        ) : null}

        <div
          className={
            expanded
              ? "flex min-h-0 flex-1 flex-col"
              : "flex flex-col gap-6 border-t pt-8 md:flex-row md:gap-12"
          }
        >
          {expanded ? null : (
            <div className="flex shrink-0 flex-col gap-1.5 md:w-54">
              <h2 className="text-base font-semibold">General</h2>
              <p className="text-[13px] leading-5 text-muted-foreground">
                The name and context people see on the board and in the sidebar.
              </p>
            </div>
          )}

          <FieldGroup
            className={expanded ? "min-h-0 flex-1 gap-0" : "grow gap-6"}
          >
            <form.Field
              name="project_name"
              validators={{
                onChange: ({ value }) => validateProjectName(value),
              }}
            >
              {(field) => {
                const fieldError = field.state.meta.errors.find(
                  (item): item is string => typeof item === "string"
                )
                return (
                  <Field
                    className={cn("gap-2", expanded && "hidden")}
                    data-invalid={fieldError ? true : undefined}
                  >
                    <FieldLabel htmlFor="project-settings-name">
                      Project name
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                    </FieldLabel>
                    <Input
                      id="project-settings-name"
                      name="project_name"
                      autoComplete="off"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      aria-invalid={fieldError ? true : undefined}
                      className="h-10.5 rounded-lg"
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
                        <FieldLabel id="project-settings-description-label">
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
                          command="projectSettings.toggleDescription"
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
                        <Skeleton className="h-28 rounded-xl" />
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

            {expanded ? null : (
              <div className="flex items-center justify-end gap-2.5">
                <p
                  className={cn(
                    "grow text-xs",
                    state === "missing-name"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                  aria-live="polite"
                >
                  {SAVE_STATUS[state]}
                </p>
                <Button
                  type="submit"
                  className="h-9.5 px-4.5 font-semibold"
                  disabled={state !== "dirty"}
                >
                  Save changes
                </Button>
              </div>
            )}
          </FieldGroup>
        </div>

        {expanded ? (
          <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-8 py-5">
            <div className="flex flex-col gap-1">
              <span className="text-sm">
                {SAVE_STATUS[state === "missing-name" ? "dirty" : state]}
              </span>
              <span className="text-xs text-muted-foreground">
                <HotkeyText command="projectSettings.collapseDescription" /> to
                return to settings · Nothing saves until you save
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
        ) : null}
      </form>
    )
  },
})
