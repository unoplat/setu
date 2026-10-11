import { ActivityIcon, BookOpenIcon, LinkIcon, PlusIcon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import {
  PageEmptyActions,
  PageEmptyDescription,
  PageEmptyHeader,
  PageEmptyTitle,
} from "@/components/app-ui/page-empty"
import { IconTile } from "@/components/reui/icon-tile"
import { Empty, EmptyMedia } from "@/components/ui/empty"

// Paper: Links 01 — Empty Links page.
export function LinksEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <Empty className="min-h-105 border">
      <PageEmptyHeader className="max-w-110">
        <EmptyMedia className="mb-3 gap-2">
          <IconTile variant="soft" className="text-muted-foreground">
            <BookOpenIcon />
          </IconTile>
          <IconTile variant="soft" className="text-sidebar-primary">
            <LinkIcon />
          </IconTile>
          <IconTile variant="soft" className="text-muted-foreground">
            <ActivityIcon />
          </IconTile>
        </EmptyMedia>
        <PageEmptyTitle>No links yet</PageEmptyTitle>
        <PageEmptyDescription>
          Add the docs, videos, dashboards and chat channels this project uses,
          so nobody has to dig for them.
        </PageEmptyDescription>
      </PageEmptyHeader>
      <PageEmptyActions>
        <ActionButton size="md" onClick={onAdd}>
          <PlusIcon data-icon="inline-start" />
          Add link
        </ActionButton>
      </PageEmptyActions>
    </Empty>
  )
}
