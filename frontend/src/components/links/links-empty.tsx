import { ActivityIcon, BookOpenIcon, LinkIcon, PlusIcon } from "lucide-react"

import { IconTile } from "@/components/reui/icon-tile"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

// Paper: Links 01 — Empty Links page.
export function LinksEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <Empty className="min-h-105 border">
      <EmptyHeader className="max-w-110 gap-1.5">
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
        <EmptyTitle className="text-xl font-semibold">No links yet</EmptyTitle>
        <EmptyDescription className="leading-5.5">
          Add the docs, videos, dashboards and chat channels this project uses,
          so nobody has to dig for them.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="pt-2">
        <Button className="h-9.5 px-4 font-semibold" onClick={onAdd}>
          <PlusIcon data-icon="inline-start" />
          Add link
        </Button>
      </EmptyContent>
    </Empty>
  )
}
