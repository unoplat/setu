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
import { Button } from "@/components/ui/button"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { ChevronLeftIcon, MenuIcon } from "lucide-react"
import { useDetailHeadHidden } from "@/lib/detail-head"
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
  /**
   * The open record's title and ID, and the section's list it belongs to.
   * The ID heads the phone header once the title has scrolled away.
   */
  page?: { title: string; id?: string; sectionTo: ProjectSection["to"] }
  /** A Subtask's parents, the top-level Task first, each opening its page. */
  ancestors?: TaskAncestor[]
  /** Shown after the last crumb: a Custom View's "Only you". */
  badge?: React.ReactNode
  /** The section's actions, aligned to the end of the header. */
  children?: React.ReactNode
}) {
  return (
    <>
      <PhoneHeader
        name={name}
        projectName={projectName}
        section={section}
        page={page}
      >
        {children}
      </PhoneHeader>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 max-md:hidden">
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
    </>
  )
}

/**
 * The phone's header (Paper: Shell 3, Task detail 1–2, Milestone detail 3,
 * Module detail 1): one 56px bar instead of a breadcrumb that wraps. A
 * section shows the menu button over its Project; a record shows a back
 * button to its section's list and, once its title has scrolled away, its ID
 * over its title, so what is open and its actions stay in view.
 */
function PhoneHeader({
  name,
  projectName,
  section,
  page,
  children,
}: {
  name: string
  projectName: string
  section: string
  page?: { title: string; id?: string; sectionTo: ProjectSection["to"] }
  children?: React.ReactNode
}) {
  const { toggleSidebar } = useSidebar()
  const scrolled = useDetailHeadHidden()
  const condensed = page !== undefined && scrolled

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b bg-background px-1 md:hidden">
      {page ? (
        <Button
          variant="ghost"
          size="icon-touch"
          nativeButton={false}
          aria-label={`Back to ${section}`}
          render={<Link to={page.sectionTo} params={{ name }} />}
        >
          <ChevronLeftIcon className="size-6" strokeWidth={1.75} />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-touch"
          aria-label="Open navigation"
          onClick={toggleSidebar}
        >
          <MenuIcon className="size-5" strokeWidth={1.75} />
        </Button>
      )}
      <div className="flex min-w-0 flex-1 flex-col ps-1">
        <span
          className={
            condensed
              ? "truncate font-mono text-xs text-muted-foreground"
              : "truncate text-xs font-medium text-muted-foreground"
          }
        >
          {condensed ? (page.id ?? section) : projectName}
        </span>
        <span className="truncate text-[17px] leading-5.5 font-semibold tracking-[-0.01em]">
          {condensed ? page.title : section}
        </span>
      </div>
      {children ? (
        <div className="flex shrink-0 items-center pe-1.5">{children}</div>
      ) : null}
    </header>
  )
}
