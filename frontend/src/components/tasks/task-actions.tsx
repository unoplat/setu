import * as React from "react"
import { ArchiveIcon, EllipsisIcon, LinkIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { ArchiveTaskDialog } from "./archive-task-dialog"

/**
 * Paper: 09, the ⋯ button in the header, and Task Archive 01. Archive is not
 * destructive (it can be undone for thirty days), so it is an ordinary item.
 * Anyone who can edit the Task may archive it. The confirm is the menu's
 * sibling, since the menu's content unmounts as it closes.
 * https://base-ui.com/react/components/menu
 */
export function TaskActions({
  project,
  task,
  canArchive,
}: {
  project: string
  task: { name: string; subject: string }
  canArchive: boolean
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [archiving, setArchiving] = React.useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Link copied")
    } catch {
      toast.error("The link could not be copied.")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={triggerRef}
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Task actions"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-58">
          <DropdownMenuItem onClick={() => void copyLink()}>
            <LinkIcon />
            Copy link
          </DropdownMenuItem>
          {canArchive ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setArchiving(true)}>
                <ArchiveIcon />
                Archive task…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ArchiveTaskDialog
        project={project}
        task={task}
        open={archiving}
        onOpenChange={setArchiving}
        finalFocus={triggerRef}
      />
    </>
  )
}
