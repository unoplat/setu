import { Maximize2Icon, XIcon } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"

import { createProjectFormOptions, validateProjectName, withForm } from "./form"
import { StepSubmitHotkey } from "./step-submit-hotkey"

// Paper: "Create Project Dialog" (01 — Create Project Details).

export const DetailsStep = withForm({
  ...createProjectFormOptions,
  props: {
    submitting: false,
    error: null as string | null,
    onExpand: () => {},
  },
  render: function DetailsStepForm({ form, submitting, error, onExpand }) {
    return (
      <form.FormGroup
        name="details"
        onGroupSubmit={() => void form.handleSubmit()}
      >
        {(group) => (
          <form
            className="grid gap-7"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void group.handleSubmit()
            }}
          >
            <StepSubmitHotkey onSubmit={() => void group.handleSubmit()} />

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
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>

            <FieldGroup className="gap-5">
              <form.Field
                name="details.project_name"
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
                      className="gap-2"
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
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        onBlur={field.handleBlur}
                        aria-invalid={error ? true : undefined}
                        className="h-11 rounded-xl"
                      />
                      <FieldError>{error}</FieldError>
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="details.description">
                {(field) => (
                  <Field className="gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FieldLabel htmlFor="project-description">
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
                    <Textarea
                      id="project-description"
                      name="description"
                      placeholder="Plan and deliver the next iOS and Android release."
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      className="min-h-22 rounded-xl"
                    />
                  </Field>
                )}
              </form.Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>

            <DialogFooter className="gap-2.5">
              <DialogClose render={<Button variant="outline" size="lg" />}>
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
          </form>
        )}
      </form.FormGroup>
    )
  },
})
