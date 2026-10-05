import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  useFrappePostCall,
  useSWRConfig,
  type FrappeError,
} from "frappe-react-sdk"
import { BookmarkIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { openRenameView } from "@/components/views/store"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { compactFilters, type TaskFilters } from "@/lib/task-filters"
import { viewsKey, type ViewRow } from "@/lib/views"

// Paper: CV 02 — Name the view, CV 03 — View saved and open. The popover asks
// only for a name; the filters on the Board are what gets saved. The new view
// opens at once, and the toast offers Rename for a name typed in a hurry. With
// no project it is a My tasks view (Paper: My Tasks 06).
export function SaveViewPopover({
  project,
  filters,
  label,
  variant,
}: {
  project: string | null
  filters: TaskFilters
  /** "Save view" on All tasks; "Save as new" beside a view's own Save. */
  label: string
  variant: "secondary" | "outline"
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant={variant} />}>
        {variant === "secondary" ? <BookmarkIcon /> : null}
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-90 gap-4">
        {/* Mounted only while open, so the name starts empty each time. */}
        <SaveViewForm
          project={project}
          filters={filters}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

function SaveViewForm({
  project,
  filters,
  onDone,
}: {
  project: string | null
  filters: TaskFilters
  onDone: () => void
}) {
  const id = React.useId()
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const { call, loading } = useFrappePostCall<{ message: ViewRow }>(
    "setu.api.view.create_view"
  )

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (loading || !name.trim()) return
    setError(null)
    try {
      const { message: view } = await call({
        // Left out for My tasks: a view with no project is one of its own.
        ...(project !== null && { project }),
        view_name: name.trim(),
        filters: compactFilters(filters),
      })
      // The list first, so the view's page finds it when it opens.
      await mutate(viewsKey(project))
      onDone()
      await (project === null
        ? navigate({
            to: "/my-tasks/views/$view",
            params: { view: view.name },
          })
        : navigate({
            to: "/projects/$name/views/$view",
            params: { name: project, view: view.name },
          }))
      toast.success(`Saved “${view.view_name}” to your views`, {
        action: {
          label: "Rename",
          onClick: () => openRenameView({ project, view }),
        },
      })
    } catch (caught) {
      setError(frappeErrorMessage(caught as FrappeError))
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="contents">
      <PopoverHeader>
        <PopoverTitle>Save as a view</PopoverTitle>
        <PopoverDescription>
          Come back to this board setup in one click.
        </PopoverDescription>
      </PopoverHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Name</Label>
        <Input
          id={id}
          autoFocus
          autoComplete="off"
          maxLength={140}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
          <Kbd>Esc</Kbd>
        </Button>
        <Button type="submit" disabled={loading || !name.trim()}>
          {loading ? "Saving…" : "Save view"}
          <Kbd>↵</Kbd>
        </Button>
      </div>
    </form>
  )
}
