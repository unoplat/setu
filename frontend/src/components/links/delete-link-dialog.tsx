import { useNavigate } from "@tanstack/react-router"
import { useSWRConfig } from "frappe-react-sdk"
import { SquareCheckIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  ConfirmDialog,
  ConfirmFooter,
  ConfirmHeader,
  ConfirmImpact,
} from "@/components/confirm-dialog"
import {
  displayHost,
  linkActivityKey,
  linkKey,
  linksKey,
  useDeleteLink,
} from "@/lib/links"

// Paper: Links 06 — Confirm delete link, and 07 — Link deleted. Deleting
// removes the shortcut for everyone; the tool it points at is never touched.

export interface DeletableLink {
  name: string
  link_name: string
  host: string
}

export function DeleteLinkDialog({
  project,
  projectName,
  link,
  open,
  onOpenChange,
  finalFocus,
  leave = false,
}: {
  project: string
  projectName: string
  link: DeletableLink
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: React.RefObject<HTMLElement | null>
  /** Opened from the link's own page: go back to the board once deleted. */
  leave?: boolean
}) {
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()
  const remove = useDeleteLink()

  async function confirm() {
    await remove.call({ name: link.name })
    if (leave) {
      // Off the page first, past its leave guard: an edit still waiting to
      // save has nothing left to save to.
      await navigate({
        to: "/projects/$name/links",
        params: { name: project },
        replace: true,
        ignoreBlocker: true,
      })
    }
    // Dropped, not refetched: refetching a deleted link only fails.
    void mutate(linkKey(link.name), undefined, { revalidate: false })
    void mutate(linkActivityKey(link.name), undefined, { revalidate: false })
    await mutate(linksKey(project)).catch(() => undefined)
    toast.success(`“${link.link_name}” deleted`, {
      description: "The tool itself is untouched. Add it back any time.",
    })
  }

  const host = displayHost(link.host) || "The tool"
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      onConfirm={confirm}
    >
      <ConfirmHeader
        tone="destructive"
        icon={<Trash2Icon />}
        title={`Delete “${link.link_name}”?`}
        description={`The door leaves Links for everyone on ${projectName}.`}
      />
      <ConfirmImpact
        icon={<SquareCheckIcon />}
        text={`Only the shortcut is removed. ${host} itself isn’t touched.`}
        error={undefined}
        onRetry={() => {}}
      />
      <ConfirmFooter
        tone="destructive"
        label="Delete link"
        pendingLabel="Deleting…"
        ready
      />
    </ConfirmDialog>
  )
}
