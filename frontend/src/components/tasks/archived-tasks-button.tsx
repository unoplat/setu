import { Link } from "@tanstack/react-router"
import { ArchiveIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useArchivedTasks } from "@/lib/tasks"

/**
 * Paper: Task Archive 03, "Archived 3" on the Board. The way to the Archived
 * page, shown only while something is archived. It reads the same list the
 * page does, so opening the page needs no wait.
 */
export function ArchivedTasksButton({ project }: { project: string }) {
  const { data } = useArchivedTasks(project)
  const count = data?.message.length ?? 0
  if (count === 0) return null
  return (
    <Button
      variant="outline"
      className="h-9 gap-2 px-3.5"
      render={
        <Link to="/projects/$name/tasks/archived" params={{ name: project }} />
      }
    >
      <ArchiveIcon data-icon="inline-start" className="text-muted-foreground" />
      Archived
      <span className="font-semibold tabular-nums">{count}</span>
    </Button>
  )
}
