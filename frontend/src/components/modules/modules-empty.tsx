import { LayoutGridIcon, PlusIcon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"
import {
  PageEmptyActions,
  PageEmptyDescription,
  PageEmptyHeader,
  PageEmptyIcon,
  PageEmptyTitle,
} from "@/components/app-ui/page-empty"
import { Empty } from "@/components/ui/empty"

// Paper: "Modules Empty State" on 07 — Empty Modules.
export function ModulesEmpty({
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
          <LayoutGridIcon />
        </PageEmptyIcon>
        <PageEmptyTitle>No modules yet</PageEmptyTitle>
        <PageEmptyDescription>
          Modules are the lasting parts of {projectName}, like Payments or
          Onboarding. Give each one a lead and describe what belongs inside.
        </PageEmptyDescription>
      </PageEmptyHeader>
      <PageEmptyActions>
        <ActionButton size="md" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          Create module
        </ActionButton>
      </PageEmptyActions>
    </Empty>
  )
}
