import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  useFrappeGetDoc,
  useFrappePostCall,
  useSWRConfig,
} from "frappe-react-sdk"

import { MilestoneActions } from "@/components/milestones/milestone-actions"
import { milestoneValues, prepareMilestone } from "@/components/milestones/form"
import {
  MilestoneActivityLog,
  MilestoneReadOnly,
  MilestoneSections,
} from "@/components/milestones/milestone-detail"
import { MilestoneForm } from "@/components/milestones/milestone-form"
import { ProjectHeader } from "@/components/project-header"
import { SaveIndicator, UnsavedEditsDialog } from "@/components/record-detail"
import { RecordPlaceholder } from "@/components/record-placeholder"
import { useAutosaveForm } from "@/lib/autosave"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage, frappeExceptionType } from "@/lib/frappe-error"
import {
  milestoneActivityKey,
  milestonesKey,
  useMilestone,
  type MilestoneDetail,
} from "@/lib/milestones"

// Paper: 06d — Milestone Detail (row clicked): the title, the description, the
// linked tasks and the activity in a centred column, the properties in a rail
// on the right. Every edit saves on its own (lib/autosave); there is no Save.
// Opened from the title in the milestones table; the list is
// the sibling index route, so Back returns to it with its filters in the URL.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/milestones/$milestone"
)({
  component: MilestonePage,
})

function MilestonePage() {
  const { name, milestone: milestoneName } = Route.useParams()
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const { data, error, isLoading, mutate } = useMilestone(milestoneName)
  // A milestone of another project under this project's URL is not "here".
  const milestone =
    data?.message && data.message.project === name ? data.message : undefined
  const projectName = project?.project_name ?? milestone?.project_name ?? name

  if (milestone) {
    // Keyed so another milestone starts a fresh form, save queue and composer.
    return (
      <MilestoneScreen
        key={milestone.name}
        project={name}
        milestone={milestone}
        projectName={projectName}
        replaceMilestone={(next) =>
          mutate({ message: next }, { revalidate: false })
        }
      />
    )
  }

  return (
    <>
      <ProjectHeader
        name={name}
        projectName={projectName}
        section="Milestones"
        page={{ title: milestoneName, sectionTo: "/projects/$name/milestones" }}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RecordPlaceholder loading={isLoading || (!data && !error)} withId>
          {error && frappeExceptionType(error) !== "DoesNotExistError"
            ? frappeErrorMessage(error)
            : "This milestone doesn't exist in this project."}
        </RecordPlaceholder>
      </main>
    </>
  )
}

function MilestoneScreen({
  project,
  milestone,
  projectName,
  replaceMilestone,
}: {
  project: string
  milestone: MilestoneDetail
  projectName: string
  replaceMilestone: (next: MilestoneDetail) => Promise<unknown>
}) {
  const { mutate: revalidate } = useSWRConfig()
  const [expanded, setExpanded] = React.useState(false)
  const update = useFrappePostCall<{ message: MilestoneDetail }>(
    "setu.api.milestone.update_milestone"
  )

  // The form starts from the saved milestone. An edit sends only the fields
  // that differ from it, since the server leaves every field it is not sent
  // alone, so a save here never undoes what someone changed in Desk meanwhile.
  const saved = React.useMemo(() => milestoneValues(milestone), [milestone])
  const autosave = useAutosaveForm({
    saved,
    prepare: prepareMilestone,
    save: async (changes) => {
      const response = await update.call({ name: milestone.name, ...changes })
      await replaceMilestone(response.message)
      // The list shows the title, dates and assignee; the timeline logs the
      // assignment.
      void revalidate(milestonesKey(project))
      void revalidate(milestoneActivityKey(milestone.name))
      return milestoneValues(response.message)
    },
  })
  const { form, flush } = autosave

  const canWrite = milestone.can_write
  useScope("milestone")
  useCommand(
    "milestone.toggleDescription",
    () => setExpanded((value) => !value),
    { enabled: canWrite }
  )
  useCommand("milestone.collapseDescription", () => setExpanded(false), {
    enabled: expanded,
  })
  useCommand("milestone.save", () => void flush(), { enabled: canWrite })

  const footer = (
    <MilestoneSections
      milestone={milestone}
      project={project}
      projectName={projectName}
    />
  )
  const activity = <MilestoneActivityLog milestone={milestone} />

  return (
    <>
      <ProjectHeader
        name={project}
        projectName={projectName}
        section="Milestones"
        page={{
          title: milestone.subject,
          sectionTo: "/projects/$name/milestones",
        }}
      >
        <MilestoneActions
          project={project}
          milestone={milestone}
          canDelete={milestone.can_write}
        />
      </ProjectHeader>
      <main className="flex min-h-0 flex-1 flex-col">
        {canWrite ? (
          <MilestoneForm
            form={form}
            milestone={milestone}
            project={project}
            projectName={projectName}
            listeners={autosave.listeners}
            status={autosave.status}
            indicator={
              <SaveIndicator
                status={autosave.status}
                error={autosave.error}
                savedAt={autosave.savedAt}
                onRetry={() => void flush()}
              />
            }
            expanded={expanded}
            onExpand={() => setExpanded(true)}
            onCollapse={() => setExpanded(false)}
            onSubmit={() => void flush()}
            footer={footer}
            activity={activity}
          />
        ) : (
          <MilestoneReadOnly
            milestone={milestone}
            project={project}
            projectName={projectName}
            footer={footer}
            activity={activity}
          />
        )}
      </main>
      <UnsavedEditsDialog
        leaving={autosave.leaving}
        record={milestone.subject}
        reason={autosave.error}
        saving={autosave.status === "saving"}
      />
    </>
  )
}
