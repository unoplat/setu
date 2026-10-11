import { Trash2Icon } from "lucide-react"

import { ActionButton } from "@/components/app-ui/action-button"

// Paper: "Danger Zone Section" of 05 — Project Settings. Only rendered for
// users the server says may delete (the creator or a Projects Manager);
// everyone else sees no Danger zone at all.
export function DangerZone({
  projectName,
  onDelete,
}: {
  projectName: string
  onDelete: () => void
}) {
  return (
    <section className="flex flex-col gap-6 border-t pt-8 md:flex-row md:gap-12">
      <div className="flex shrink-0 flex-col gap-1.5 md:w-54">
        <h2 className="text-base font-semibold text-destructive">
          Danger zone
        </h2>
        <p className="text-[13px] leading-5 text-muted-foreground">
          Actions here cannot be undone.
        </p>
      </div>
      <div className="flex grow flex-col items-start gap-5 rounded-xl border border-destructive/35 bg-destructive/6 p-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex grow flex-col gap-1">
          <h3 className="text-sm font-semibold">Delete this project</h3>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Only the project creator or a Projects Manager can delete{" "}
            {projectName}, and only once it has no tasks.
          </p>
        </div>
        <ActionButton
          type="button"
          tone="destructive"
          size="md"
          className="shrink-0 gap-2"
          onClick={onDelete}
        >
          <Trash2Icon className="size-3.5" />
          Delete project
        </ActionButton>
      </div>
    </section>
  )
}
