import * as React from "react"
import { RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ArchivedTask } from "@/lib/tasks"

/** Paper: Task Archive 04, a row's Restore. */
export function RestoreButton({
  task,
  restore,
}: {
  task: ArchivedTask
  restore: (task: ArchivedTask) => Promise<boolean>
}) {
  const [restoring, setRestoring] = React.useState(false)
  return (
    <div className="flex justify-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={restoring}
        onClick={async () => {
          setRestoring(true)
          // On success the row leaves the list, and this button with it.
          if (!(await restore(task))) setRestoring(false)
        }}
      >
        <RotateCcwIcon data-icon="inline-start" />
        {restoring ? "Restoring…" : "Restore"}
      </Button>
    </div>
  )
}
