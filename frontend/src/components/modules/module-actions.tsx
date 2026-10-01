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

import { DeleteModuleDialog } from "./delete-module-dialog"

/**
 * Paper: 07d, "Module Header Actions" (the ⋯ button), and Module Delete 01.
 * Delete is offered to those who can edit the module; the server still
 * checks Frappe's delete permission. The confirm is the menu's sibling,
 * since the menu's content unmounts as it closes.
 * https://base-ui.com/react/components/menu
 */
export function ModuleActions({
  project,
  module,
  canDelete,
}: {
  project: string
  module: { name: string; module_name: string }
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
              aria-label="Module actions"
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
                Delete module…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteModuleDialog
        project={project}
        module={module}
        open={deleting}
        onOpenChange={setDeleting}
        finalFocus={triggerRef}
      />
    </>
  )
}
