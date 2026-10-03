import { FlagIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

// Paper: "Milestones Empty State" on 06 — Empty Milestones.
export function MilestonesEmpty({
  projectName,
  onCreate,
}: {
  projectName: string
  onCreate: () => void
}) {
  return (
    <Empty className="pb-24">
      <EmptyHeader className="max-w-105 gap-1.5">
        <EmptyMedia
          variant="icon"
          className="mb-2.5 size-12 text-sidebar-primary [&_svg:not([class*='size-'])]:size-5.5"
        >
          <FlagIcon />
        </EmptyMedia>
        <EmptyTitle className="text-xl font-semibold">
          No milestones yet
        </EmptyTitle>
        <EmptyDescription className="leading-5.5">
          Milestones mark the checkpoints {projectName} is working toward. Once
          one exists, tasks can link to it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="pt-2">
        <Button className="h-9.5 px-4 font-semibold" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          Create milestone
        </Button>
      </EmptyContent>
    </Empty>
  )
}
