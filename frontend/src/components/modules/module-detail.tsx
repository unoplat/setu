import * as React from "react"
import { LayoutGridIcon } from "lucide-react"

import {
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
import { moduleActivityKey, type ModuleDetail } from "@/lib/modules"
import { useRelatedTasks } from "@/lib/tasks"

const MODULE_ACTIVITY: ActivitySource = {
  method: "setu.api.module.get_module_activity",
  commentMethod: "setu.api.module.add_module_comment",
  key: moduleActivityKey,
  commentScope: "module-comment",
  commentCommand: "module.comment",
  createdLabel: "this module",
}

/**
 * Paper: 07d — what follows the description in the content column: the Tasks
 * filed under the module, then its comments.
 */
export function ModuleSections({
  module,
  projectName,
}: {
  module: ModuleDetail
  projectName: string
}) {
  return (
    <>
      <RelatedTasks
        project={module.project}
        projectName={projectName}
        heading="Tasks"
        link={{ module: module.name }}
        emptyTitle={`No tasks in ${module.module_name} yet`}
        emptyText={`Add a task here, or pick ${module.module_name} in a task’s Module field.`}
        canAdd={module.can_write}
      />
      <RecordComments record={module.name} source={MODULE_ACTIVITY} />
    </>
  )
}

/** 07d's Activity, closing the rail. */
export function ModuleActivityLog({ module }: { module: ModuleDetail }) {
  return <RecordActivityLog record={module.name} source={MODULE_ACTIVITY} />
}

/** 07d's "Module" chip, above the name. */
export function ModuleKind() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5.5 items-center gap-1 rounded-sm border px-2 text-xs font-medium">
        <LayoutGridIcon className="size-3 text-sidebar-primary" />
        Module
      </span>
    </div>
  )
}

/** The rail's progress block, counted from the module's Tasks. */
export function ModuleProgress({ module }: { module: ModuleDetail }) {
  const { done, total, loading } = useRelatedTasks(module.project, {
    module: module.name,
  })
  return (
    <RailGroup className="gap-2.5">
      <ProgressSummary
        done={done}
        total={total}
        loading={loading}
        note={`Counts every task whose Module is ${module.module_name}.`}
      />
    </RailGroup>
  )
}

/** 07d for someone who may read the module but not edit it. */
export function ModuleReadOnly({
  module,
  projectName,
  footer,
  activity,
}: {
  module: ModuleDetail
  projectName: string
  /** What follows the description: the module's tasks, then the comments. */
  footer: React.ReactNode
  /** What closes the rail: the activity log. */
  activity: React.ReactNode
}) {
  return (
    <DetailLayout
      rail={
        <>
          <RailGroup label="Properties">
            <dl className="flex flex-col">
              <Property label="Lead" plain>
                <PersonValue person={module.lead} emptyLabel="No lead" />
              </Property>
              <ProjectProperty projectName={projectName} />
            </dl>
          </RailGroup>
          <ModuleProgress module={module} />
          {activity}
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <KindRow>
            <ModuleKind />
          </KindRow>
          <h1 className="text-3xl/9 font-semibold tracking-tight">
            {module.module_name}
          </h1>
        </div>
        <ReadOnlyDescription value={module.description} />
      </div>
      {footer}
    </DetailLayout>
  )
}
