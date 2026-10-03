import {
  useFrappePostCall,
  useSWRConfig,
  type FrappeError,
} from "frappe-react-sdk"
import { BookmarkIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SaveViewPopover } from "@/components/views/save-view-popover"
import { TaskFilterBar } from "@/components/views/task-filter-bar"
import { ViewSwitcher } from "@/components/views/view-switcher"
import type { Assignee } from "@/lib/assignees"
import { frappeErrorMessage } from "@/lib/frappe-error"
import type { Milestone } from "@/lib/milestones"
import { compactFilters, type BoardFilters } from "@/lib/task-filters"
import { viewsKey, type View } from "@/lib/views"

// Paper: "Custom view journey", CV 01 to CV 05. The Board's toolbar: which
// view is open, the filters, and what can be done with a change to them.
//
// - On All tasks, any filter offers Reset and Save view (CV 01).
// - On a view, a change marks it Edited and offers Reset, Save as new and
//   Save view (CV 05). Nothing is saved until one of them is pressed.
export function BoardToolbar({
  project,
  view,
  views,
  board,
  milestones,
  people,
  tags,
}: {
  project: string
  /** The open view; null on All tasks. */
  view: View | null
  views: readonly View[]
  board: BoardFilters
  milestones: readonly Milestone[]
  people: readonly Assignee[]
  tags: readonly string[]
}) {
  const { filters, edited, setFilters, reset } = board
  const { mutate } = useSWRConfig()
  const update = useFrappePostCall<{ message: unknown }>(
    "setu.api.view.update_view"
  )

  async function saveChanges() {
    if (!view || update.loading) return
    try {
      await update.call({ name: view.name, filters: compactFilters(filters) })
      // The saved filters first, then the URL: the other way round the Board
      // would show the old view for a moment.
      await mutate(viewsKey(project))
      reset()
      toast.success(`“${view.view_name}” updated`)
    } catch (caught) {
      toast.error(`“${view.view_name}” could not be saved`, {
        description: frappeErrorMessage(caught as FrappeError),
      })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
      <ViewSwitcher project={project} views={views} current={view} />
      <TaskFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        milestones={milestones}
        people={people}
        tags={tags}
      />
      {edited ? (
        <>
          <Separator orientation="vertical" className="mx-1 h-5 self-center" />
          {view ? (
            <span className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-sidebar-primary"
              />
              Edited
            </span>
          ) : null}
          <Button variant="ghost" onClick={reset}>
            Reset
          </Button>
          {view ? (
            <>
              <SaveViewPopover
                project={project}
                filters={filters}
                label="Save as new"
                variant="outline"
              />
              <Button
                variant="secondary"
                disabled={update.loading}
                onClick={() => void saveChanges()}
              >
                <BookmarkIcon />
                {update.loading ? "Saving…" : "Save view"}
              </Button>
            </>
          ) : (
            <SaveViewPopover
              project={project}
              filters={filters}
              label="Save view"
              variant="secondary"
            />
          )}
        </>
      ) : null}
    </div>
  )
}
