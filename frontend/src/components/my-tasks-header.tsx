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

// Paper: My Tasks 05 to 07, "Application Header" as on the project screens
// (project-header.tsx): the sidebar toggle and a breadcrumb. My tasks belongs
// to no Project, so it is the first crumb; an open view adds its name, and My
// tasks becomes a link back to All my tasks.
export function MyTasksHeader({
  page,
  badge,
}: {
  /** The open view's name. */
  page?: string
  /** Shown after the last crumb: a Custom View's "Only you". */
  badge?: React.ReactNode
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {page ? (
              <BreadcrumbLink render={<Link to="/my-tasks" />}>
                My tasks
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>My tasks</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {page ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">{page}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
      {badge}
    </header>
  )
}
