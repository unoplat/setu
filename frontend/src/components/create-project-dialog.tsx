import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { useFrappePostCall } from "frappe-react-sdk"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { useProjects, type ProjectSummary } from "@/lib/projects"

// Paper: "Create Project Dialog" (01 — Create Project Details).

function textField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value.trim() : ""
}
// Creates an ERPNext Project through setu.api.project.create_project, which
// fills the mandatory Company server-side so the dialog stays two fields.

export function CreateProjectDialog({
  trigger,
}: {
  /** Element that opens the dialog; receives the trigger props via `render`. */
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const navigate = useNavigate()
  const { mutate: revalidateProjects } = useProjects()
  const { call, loading, error, reset } = useFrappePostCall<{
    message: ProjectSummary
  }>("setu.api.project.create_project")

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      reset()
      setNameError(null)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const project_name = textField(form, "project_name")
    const description = textField(form, "description")
    if (!project_name) {
      setNameError("Give the project a name.")
      return
    }
    setNameError(null)

    // On failure the hook exposes `error`, rendered below the fields.
    const response = await call({ project_name, description }).catch(() => null)
    if (!response) return

    await revalidateProjects()
    setOpen(false)
    void navigate({
      to: "/projects/$name",
      params: { name: response.message.name },
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-3xl p-7 sm:max-w-[520px]"
      >
        <form className="grid gap-7" onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                Create a project
              </DialogTitle>
              <DialogDescription>
                Name the work and add enough context for invited members.
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
            <Field
              className="gap-2"
              data-invalid={nameError ? true : undefined}
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
                required
                aria-invalid={nameError ? true : undefined}
                className="h-11 rounded-xl"
              />
              <FieldError>{nameError}</FieldError>
            </Field>

            <Field className="gap-2">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="project-description">
                  Description
                </FieldLabel>
                <span className="text-xs text-muted-foreground">Optional</span>
              </div>
              <Textarea
                id="project-description"
                name="description"
                placeholder="Plan and deliver the next iOS and Android release."
                className="min-h-22 rounded-xl"
              />
            </Field>

            {error ? (
              <FieldError>{frappeErrorMessage(error)}</FieldError>
            ) : null}
          </FieldGroup>

          <DialogFooter className="gap-2.5">
            <DialogClose render={<Button variant="outline" size="lg" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="lg"
              className="font-semibold"
              disabled={loading}
            >
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
