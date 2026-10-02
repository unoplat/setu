import * as React from "react"
import { EllipsisIcon, LinkIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { DeleteTaskDialog } from "./delete-task-dialog"

/**
 * The ⋯ button in the Task header. Deletion requires delete permission and
 * a destructive confirmation. The confirm is the menu's sibling, since the
 * menu's content unmounts as it closes.
 * https://base-ui.com/react/components/menu
 */
export function TaskActions({
  project,
  task,
  canDelete,
}: {
  project: string
  task: { name: string; subject: string }
  canDelete: boolean
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [deleting, setDeleting] = React.useState(false)

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
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleting(true)}
              >
                <Trash2Icon />
                Delete task…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteTaskDialog
        project={project}
        task={task}
        open={deleting}
        onOpenChange={setDeleting}
        finalFocus={triggerRef}
      />
    </>
  )
}
