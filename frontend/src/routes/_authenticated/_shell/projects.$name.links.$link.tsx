import * as React from "react"
import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useFrappeGetDoc, useSWRConfig } from "frappe-react-sdk"
import { toast } from "sonner"

import { linkValues, prepareLink } from "@/components/links/form"
import { LinkActions } from "@/components/links/link-actions"
import {
  LinkActivityLog,
  LinkReadOnly,
  LinkSections,
} from "@/components/links/link-detail"
import { LinkForm } from "@/components/links/link-form"
import { ProjectHeader } from "@/components/project-header"
import { SaveIndicator, UnsavedEditsDialog } from "@/components/record-detail"
import { RecordPlaceholder } from "@/components/record-placeholder"
import { useAutosaveForm } from "@/lib/autosave"
import { useCommand, useScope } from "@/lib/commands"
import { frappeErrorMessage, frappeExceptionType } from "@/lib/frappe-error"
import {
  linkActivityKey,
  linksKey,
  useLink,
  useUpdateLink,
  type LinkDetail,
} from "@/lib/links"

// Paper: Links 04a — Link detail (card clicked): the name, the address and the
// rich text description in a centred column, the properties in a rail on the right, as
// on the module page. Every edit saves on its own (lib/autosave); there is no
// Save. Opened from a door on the board; the board is the sibling index route.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/links/$link"
)({
  component: LinkPage,
})

function LinkPage() {
  const { name, link: linkName } = Route.useParams()
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const { data, error, isLoading, mutate } = useLink(linkName)
  const link = data?.message
  const projectName = project?.project_name ?? link?.project_name ?? name

  // A link moved to another project (from here, or a URL from before the
  // move) opens under the project it is in now.
  if (link && link.project !== name) {
    return (
      <Navigate
        to="/projects/$name/links/$link"
        params={{ name: link.project, link: link.name }}
        replace
      />
    )
  }

  if (link) {
    // Keyed so another link starts a fresh form, save queue and composer.
    return (
      <LinkScreen
        key={link.name}
        project={name}
        link={link}
        projectName={projectName}
        replaceLink={(next) => mutate({ message: next }, { revalidate: false })}
      />
    )
  }

  return (
    <>
      <ProjectHeader
        name={name}
        projectName={projectName}
        section="Links"
        page={{ title: linkName, sectionTo: "/projects/$name/links" }}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RecordPlaceholder loading={isLoading || (!data && !error)}>
          {error && frappeExceptionType(error) !== "DoesNotExistError"
            ? frappeErrorMessage(error)
            : "This link doesn't exist."}
        </RecordPlaceholder>
      </main>
    </>
  )
}

function LinkScreen({
  project,
  link,
  projectName,
  replaceLink,
}: {
  project: string
  link: LinkDetail
  projectName: string
  replaceLink: (next: LinkDetail) => Promise<unknown>
}) {
  const { mutate: revalidate } = useSWRConfig()
  const [expanded, setExpanded] = React.useState(false)
  const update = useUpdateLink()

  // The form starts from the saved link. An edit sends only the fields that
  // differ from it, since the server leaves every field it is not sent alone.
  const saved = React.useMemo(() => linkValues(link), [link])
  const autosave = useAutosaveForm({
    saved,
    prepare: prepareLink,
    save: async (changes) => {
      const response = await update.call({ name: link.name, ...changes })
      const next = response.message
      // A move re-renders this page at the link's new project's URL.
      await replaceLink(next)
      // The board shows the name, description, type and host; the timeline
      // logs the change.
      void revalidate(linksKey(project))
      void revalidate(linkActivityKey(link.name))
      if (next.project !== project) {
        void revalidate(linksKey(next.project))
        toast.success(`Moved to ${next.project_name ?? next.project}`)
      }
      return linkValues(next)
    },
  })
  const { form, flush } = autosave

  const canWrite = link.can_write
  useScope("link")
  useCommand("link.toggleDescription", () => setExpanded((value) => !value), {
    enabled: canWrite,
  })
  useCommand("link.collapseDescription", () => setExpanded(false), {
    enabled: expanded,
  })
  useCommand("link.save", () => void flush(), { enabled: canWrite })

  const footer = <LinkSections link={link} />
  const activity = <LinkActivityLog link={link} />

  return (
    <>
      <ProjectHeader
        name={project}
        projectName={projectName}
        section="Links"
        page={{ title: link.link_name, sectionTo: "/projects/$name/links" }}
      >
        <LinkActions
          project={project}
          projectName={projectName}
          link={link}
          canDelete={canWrite}
        />
      </ProjectHeader>
      <main className="flex min-h-0 flex-1 flex-col">
        {canWrite ? (
          <LinkForm
            form={form}
            link={link}
            projectName={projectName}
            listeners={autosave.listeners}
            status={autosave.status}
            descriptionRevision={autosave.replaced.description ?? 0}
            descriptionConflict={
              autosave.conflicts.includes("description")
                ? (choice) => autosave.resolveConflicts(choice, ["description"])
                : null
            }
            indicator={
              <SaveIndicator
                status={autosave.status}
                error={autosave.error}
                savedAt={autosave.savedAt}
                onRetry={() => void flush()}
                onResolve={(choice) => autosave.resolveConflicts(choice)}
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
          <LinkReadOnly
            link={link}
            projectName={projectName}
            footer={footer}
            activity={activity}
          />
        )}
      </main>
      <UnsavedEditsDialog
        leaving={autosave.leaving}
        record={link.link_name}
        reason={autosave.error}
        saving={autosave.status === "saving"}
        conflict={autosave.status === "conflict"}
      />
    </>
  )
}
