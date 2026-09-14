import * as React from "react"
import { useStore } from "@tanstack/react-form"
import { CheckIcon, Minimize2Icon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

import { createProjectFormOptions, withForm } from "./form"

const DescriptionEditor = React.lazy(() => import("./description-editor"))

// Paper: "Expanded Description — mxeditor". The draft lives in the same form
// field as the compact textarea, so expanding and collapsing loses nothing
// and the project is still not created until step 2 submits.

export const ExpandedDescription = withForm({
  ...createProjectFormOptions,
  props: {
    onCollapse: () => {},
  },
  render: function ExpandedDescriptionView({ form, onCollapse }) {
    const projectName = useStore(
      form.store,
      (state) => state.values.details.project_name
    )
    return (
      <>
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

        <form.Field name="details.description">
          {(field) => (
            <React.Suspense
              fallback={
                <div className="flex min-h-0 flex-1 flex-col gap-4 px-12 py-10">
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              }
            >
              <DescriptionEditor
                value={field.state.value}
                onChange={(markdown) => field.handleChange(markdown)}
                className="flex min-h-0 flex-1 flex-col"
              />
            </React.Suspense>
          )}
        </form.Field>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-8 py-5">
          <div className="flex flex-col gap-1">
            <span className="text-sm">Changes stay in your project draft</span>
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
      </>
    )
  },
})
