import { LayoutGridIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

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
      <EmptyHeader className="max-w-105 gap-1.5">
        <EmptyMedia
          variant="icon"
          className="mb-2.5 size-12 text-sidebar-primary [&_svg:not([class*='size-'])]:size-5.5"
        >
          <LayoutGridIcon />
        </EmptyMedia>
        <EmptyTitle className="text-xl font-semibold">
          No modules yet
        </EmptyTitle>
        <EmptyDescription className="leading-5.5">
          Modules are the lasting parts of {projectName}, like Payments or
          Onboarding. Give each one a lead and describe what belongs inside.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="pt-2">
        <Button className="h-9.5 px-4 font-semibold" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          Create module
        </Button>
      </EmptyContent>
    </Empty>
  )
}
