import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useFrappeGetDoc } from "frappe-react-sdk"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { CreateLinkDialog } from "@/components/links/create-link-dialog"
import { AddLinkCard, LinkCard } from "@/components/links/link-card"
import { LinksEmpty } from "@/components/links/links-empty"
import { ProjectHeader } from "@/components/project-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { useLinks, type LinkSummary } from "@/lib/links"

// Paper: Links 01 — Empty Links page, the Add link dialog (02, 02a, 02b), and
// the board of doors (03, 04). Board only: there is no list view.
export const Route = createFileRoute(
  "/_authenticated/_shell/projects/$name/links/"
)({
  component: LinksPage,
})

function LinksPage() {
  const { name } = Route.useParams()
  const navigate = Route.useNavigate()
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const projectName = project?.project_name ?? name
  const { data, error, isLoading, mutate } = useLinks(name)
  const [adding, setAdding] = React.useState(false)
  // Paper 03: the link this visit added is ringed until the page is left.
  const [created, setCreated] = React.useState<string | null>(null)
  const links = data?.message
  const add = () => setAdding(true)

  async function onCreated(link: LinkSummary) {
    // It exists either way; a failed refresh still announces it.
    await mutate().catch(() => undefined)
    setCreated(link.name)
    toast.success(`“${link.link_name}” added`, {
      description: `Everyone on ${projectName} can open it from Links.`,
      action: {
        label: "Open",
        onClick: () =>
          void navigate({
            to: "/projects/$name/links/$link",
            params: { name, link: link.name },
          }),
      },
    })
  }

  return (
    <>
      <ProjectHeader name={name} projectName={projectName} section="Links" />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 sm:px-12 sm:py-12">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Links</h1>
              <p className="text-sm text-muted-foreground">
                The tools {projectName} lives in outside Envision. Everyone on
                the project sees the same doors.
              </p>
            </div>
            {links?.length ? (
              <Button className="h-9 px-3.5 font-semibold" onClick={add}>
                <PlusIcon data-icon="inline-start" />
                Add link
              </Button>
            ) : null}
          </div>

          {isLoading || (!links && !error) ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-50 rounded-2xl" />
              ))}
            </div>
          ) : error || !links ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              {error ? frappeErrorMessage(error) : "Links could not be loaded."}
            </div>
          ) : links.length === 0 ? (
            <LinksEmpty onAdd={add} />
          ) : (
            <ul
              aria-label={`Links of ${projectName}`}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
            >
              {links.map((link) => (
                <li key={link.name} className="flex flex-col *:flex-1">
                  <LinkCard
                    project={name}
                    projectName={projectName}
                    link={link}
                    isNew={link.name === created}
                  />
                </li>
              ))}
              <li className="flex flex-col *:flex-1">
                <AddLinkCard onAdd={add} />
              </li>
            </ul>
          )}
        </div>
      </main>
      {/* Keyed so another project's page starts with an empty draft. */}
      <CreateLinkDialog
        key={name}
        open={adding}
        onOpenChange={setAdding}
        project={name}
        projectName={projectName}
        onCreated={onCreated}
      />
    </>
  )
}
