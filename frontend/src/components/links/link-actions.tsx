import * as React from "react"
import {
  ArrowUpRightIcon,
  CopyIcon,
  EllipsisIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { copyAddress } from "@/lib/links"
import { cn } from "@/lib/utils"

import { DeleteLinkDialog, type DeletableLink } from "./delete-link-dialog"

/**
 * Paper: Links 05 — Door actions menu (a card's ⋯), and the ⋯ in the link
 * page's header (04a). Delete is offered to those who can edit the link; the
 * server still checks Frappe's delete permission. The confirm is the menu's
 * sibling, since the menu's content unmounts as it closes.
 * https://base-ui.com/react/components/menu
 */
export function LinkActions({
  project,
  projectName,
  link,
  canDelete = true,
  variant = "header",
  className,
}: {
  project: string
  projectName: string
  link: DeletableLink & { url: string }
  canDelete?: boolean
  /** "card": the quiet ⋯ on a door. "header": the page header's button. */
  variant?: "card" | "header"
  className?: string
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [deleting, setDeleting] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={triggerRef}
              variant={variant === "card" ? "ghost" : "outline"}
              size={variant === "card" ? "icon-sm" : "icon"}
              className={cn(
                variant === "card" ? "size-7" : "size-8",
                className
              )}
              aria-label={`Actions for ${link.link_name}`}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() =>
              window.open(link.url, "_blank", "noopener,noreferrer")
            }
          >
            <ArrowUpRightIcon />
            Open in new tab
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyAddress(link.url)}>
            <CopyIcon />
            Copy address
          </DropdownMenuItem>
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleting(true)}
              >
                <Trash2Icon />
                Delete link…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteLinkDialog
        project={project}
        projectName={projectName}
        link={link}
        open={deleting}
        onOpenChange={setDeleting}
        finalFocus={triggerRef}
        leave={variant === "header"}
      />
    </>
  )
}
