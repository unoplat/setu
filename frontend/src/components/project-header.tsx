import { Link } from "@tanstack/react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { ProjectSection } from "@/components/project-sections"

// Paper: "Application Header" on the project screens — the sidebar toggle,
// a Projects › project › section breadcrumb, and the section's own actions
// (e.g. "New milestone") at the far end. A record inside a section adds one
// more crumb (Projects › project › Milestones › "Beta build ready"), and the
// section becomes a link back to its list.
export function ProjectHeader({
  name,
  projectName,
  section,
  page,
  badge,
  children,
}: {
  name: string
  projectName: string
  section: string
  /** The open record's title, and the section's list it belongs to. */
  page?: { title: string; sectionTo: ProjectSection["to"] }
  /** Shown after the last crumb: a Custom View's "Only you". */
  badge?: React.ReactNode
  /** The section's actions, aligned to the end of the header. */
  children?: React.ReactNode
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link to="/projects/$name" params={{ name }} />}
            >
              {projectName}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {page ? (
              <BreadcrumbLink
                render={<Link to={page.sectionTo} params={{ name }} />}
              >
                {section}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{section}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {page ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">
                  {page.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
      {badge}
      {children ? (
        <div className="ms-auto flex items-center gap-2">{children}</div>
      ) : null}
    </header>
  )
}
