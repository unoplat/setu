import * as React from "react"
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  FlagIcon,
} from "lucide-react"

import {
  DatesProperty,
  PersonValue,
  ProgressSummary,
  ProjectProperty,
  Property,
  ReadOnlyDescription,
} from "@/components/detail-properties"
import {
  RecordActivityLog,
  RecordComments,
  type ActivitySource,
} from "@/components/record-activity"
import { DetailLayout, KindRow, RailGroup } from "@/components/record-detail"
import { RelatedTasks } from "@/components/tasks/related-tasks"
import {
  dueHint,
  formatShortDay,
  milestoneActivityKey,
  type MilestoneDetail,
} from "@/lib/milestones"

import {
  PROGRESS_LABELS,
  progressBucket,
  type ProgressBucket,
} from "./milestone-filters"

const MILESTONE_ACTIVITY: ActivitySource = {
  method: "setu.api.milestone.get_milestone_activity",
  commentMethod: "setu.api.milestone.add_milestone_comment",
  key: milestoneActivityKey,
  commentScope: "milestone-comment",
  commentCommand: "milestone.comment",
  createdLabel: "this milestone",
}

const PROGRESS_ICONS: Record<ProgressBucket, React.ReactNode> = {
  not_started: <CircleDashedIcon />,
  in_progress: <CircleDotIcon />,
  done: <CircleCheckIcon />,
}

/**
 * Paper: 06d — what follows the description in the content column: the Tasks
 * linked to the milestone, then its comments.
 */
export function MilestoneSections({
  milestone,
  project,
  projectName,
}: {
  milestone: MilestoneDetail
  /** The Project's name (its id). */
  project: string
  projectName: string
}) {
  return (
    <>
      <RelatedTasks
        project={project}
        projectName={projectName}
        heading="Linked tasks"
        link={{ milestone: milestone.name }}
        emptyTitle="No tasks linked yet"
        emptyText="Add a task here, or pick this milestone in a task’s Milestone field."
        canAdd={milestone.can_write}
      />
      <RecordComments record={milestone.name} source={MILESTONE_ACTIVITY} />
    </>
  )
}

/** 06d's Activity, closing the rail. */
export function MilestoneActivityLog({
  milestone,
}: {
  milestone: MilestoneDetail
}) {
  return (
    <RecordActivityLog record={milestone.name} source={MILESTONE_ACTIVITY} />
  )
}

/** The "Milestone" chip and the Task's ID, above the title. */
export function MilestoneKind({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5.5 items-center gap-1 rounded-sm border px-2 text-xs font-medium">
        <FlagIcon className="size-3 text-sidebar-primary" />
        Milestone
      </span>
      <span className="font-mono text-xs text-muted-foreground">{name}</span>
    </div>
  )
}

/**
 * A milestone's Status follows its linked Tasks, so it is text in the rail
 * and never a picker.
 */
export function MilestoneStatus({ progress }: { progress: number }) {
  const bucket = progressBucket(progress)
  return (
    <Property label="Status" plain>
      <span className="flex shrink-0 text-muted-foreground [&_svg]:size-3.5">
        {PROGRESS_ICONS[bucket]}
      </span>
      {PROGRESS_LABELS[bucket]}
    </Property>
  )
}

/**
 * The rail's progress block. The server's count, as the Status above it and
 * the milestones list use, so the three never disagree.
 */
export function MilestoneProgress({
  milestone,
}: {
  milestone: MilestoneDetail
}) {
  return (
    <RailGroup className="gap-2.5">
      <ProgressSummary
        done={milestone.done_tasks}
        total={milestone.total_tasks}
        loading={false}
        note="Status updates itself as linked tasks move to Done."
      />
    </RailGroup>
  )
}

/** 06d for someone who may read the milestone but not edit it. */
export function MilestoneReadOnly({
  milestone,
  projectName,
  footer,
  activity,
}: {
  milestone: MilestoneDetail
  projectName: string
  /** What follows the description: linked tasks, then the comments. */
  footer: React.ReactNode
  /** What closes the rail: the activity log. */
  activity: React.ReactNode
}) {
  const notSet = <span className="text-muted-foreground">Not set</span>

  return (
    <DetailLayout
      rail={
        <>
          <RailGroup label="Properties">
            <dl className="flex flex-col">
              <MilestoneStatus progress={milestone.progress} />
              <Property label="Assignee" plain>
                <PersonValue
                  person={milestone.assignee}
                  emptyLabel="Unassigned"
                />
              </Property>
            </dl>
          </RailGroup>
          <RailGroup>
            <dl className="flex flex-col">
              <DatesProperty
                plain
                start={
                  milestone.start_date
                    ? formatShortDay(milestone.start_date)
                    : notSet
                }
                due={
                  milestone.due_date
                    ? formatShortDay(milestone.due_date)
                    : notSet
                }
                hint={
                  milestone.due_date && milestone.progress < 100
                    ? dueHint(milestone.due_date)
                    : null
                }
              />
              <ProjectProperty projectName={projectName} />
            </dl>
          </RailGroup>
          <MilestoneProgress milestone={milestone} />
          {activity}
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <KindRow>
            <MilestoneKind name={milestone.name} />
          </KindRow>
          <h1 className="text-3xl/9 font-semibold tracking-tight">
            {milestone.subject}
          </h1>
        </div>
        <ReadOnlyDescription value={milestone.description} />
      </div>
      {footer}
    </DetailLayout>
  )
}
