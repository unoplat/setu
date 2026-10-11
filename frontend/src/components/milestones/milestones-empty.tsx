import { FlagIcon, PlusIcon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import {
  PageEmptyActions,
  PageEmptyDescription,
  PageEmptyHeader,
  PageEmptyIcon,
  PageEmptyTitle,
} from "@/components/app-ui/page-empty"
import { Empty } from "@/components/ui/empty"

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
      <PageEmptyHeader className="max-w-105">
        <PageEmptyIcon>
          <FlagIcon />
        </PageEmptyIcon>
        <PageEmptyTitle>No milestones yet</PageEmptyTitle>
        <PageEmptyDescription>
          Milestones mark the checkpoints {projectName} is working toward. Once
          one exists, tasks can link to it.
        </PageEmptyDescription>
      </PageEmptyHeader>
      <PageEmptyActions>
        <ActionButton size="md" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          Create milestone
        </ActionButton>
      </PageEmptyActions>
    </Empty>
  )
}
