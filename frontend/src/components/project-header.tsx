import * as React from "react"
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
import type { TaskAncestor } from "@/lib/tasks"

// Paper: "Application Header" on the project screens — the sidebar toggle,
// a Projects › project › section breadcrumb, and the section's own actions
// (e.g. "New milestone") at the far end. A record inside a section adds one
// more crumb (Projects › project › Milestones › "Beta build ready"), and the
// section becomes a link back to its list. A Subtask's parents come between
// (Paper 09l: Tasks › Prepare release checklist › Draft Android release notes).
export function ProjectHeader({
  name,
  projectName,
  section,
  page,
  ancestors = [],
  badge,
  children,
}: {
  name: string
  projectName: string
  section: string
  /** The open record's title, and the section's list it belongs to. */
  page?: { title: string; sectionTo: ProjectSection["to"] }
  /** A Subtask's parents, the top-level Task first, each opening its page. */
  ancestors?: TaskAncestor[]
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
          {page
            ? ancestors.map((ancestor) => (
                <React.Fragment key={ancestor.name}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbLink
                      className="max-w-48 truncate"
                      render={
                        <Link
                          to="/projects/$name/tasks/$task"
                          params={{ name, task: ancestor.name }}
                        />
                      }
                    >
                      {ancestor.subject}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </React.Fragment>
              ))
            : null}
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
