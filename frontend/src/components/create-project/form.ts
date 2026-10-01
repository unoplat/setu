import { formOptions } from "@tanstack/react-form"

export {
  submitOnce,
  useAppForm,
  validateProjectName,
  withForm,
} from "@/lib/form"

export interface CreateProjectValues {
  project_name: string
  /** The rich text editor's HTML, or "" when nothing was written. */
  description: string
}

export const createProjectFormOptions = formOptions({
  defaultValues: { project_name: "", description: "" } as CreateProjectValues,
})
