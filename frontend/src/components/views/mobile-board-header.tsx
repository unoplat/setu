import * as React from "react"
import {
  ChevronDownIcon,
  ListFilterIcon,
  MenuIcon,
  SearchIcon,
} from "lucide-react"

import { openPalette } from "@/components/search/store"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { useSidebar } from "@/components/ui/sidebar"
import { MobileViewsSheet } from "@/components/views/mobile-views-sheet"
import {
  openViewsSheet,
  useViewsSheetOpen,
} from "@/components/views/views-sheet-store"
import type { View } from "@/lib/views"
import { TASK_FILTER_FIELDS, type TaskFilters } from "@/lib/task-filters"

// Paper: Kanban · 1 Board default. On a phone the Board's header is one 56px
// bar: the drawer button, the Project over the section, then search and
// View & filter. The last opens a bottom sheet with the Board's toolbar (the
// view switcher and the filters), and its badge counts the filters in use.
// Wider screens keep the breadcrumb header and the toolbar above the Board.
//
// Paper: "Saved views · 1 Title shows the view". The title names the open
// view and opens the saved views sheet (mobile-views-sheet.tsx).
export function MobileBoardHeader({
  context,
  title,
  filters,
  views,
  children,
}: {
  /** The small line over the title: the Project, or "My tasks". */
  context?: string
  /** The section or the open view. */
  title: string
  filters: TaskFilters
  /** The Board's saved views, which the title switches between. */
  views: {
    project: string | null
    list: readonly View[]
    current: View | null
    edited: boolean
  }
  /** What the View & filter sheet shows: the Board's toolbar. */
  children: React.ReactNode
}) {
  const { toggleSidebar } = useSidebar()
  const [open, setOpen] = React.useState(false)
  const sheetOpen = useViewsSheetOpen()
  const active = TASK_FILTER_FIELDS.filter(
    (field) => filters[field].length > 0
  ).length

  return (
    <>
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-background px-1 md:hidden">
        <HeaderButton label="Open navigation" onClick={toggleSidebar}>
          <MenuIcon className="size-5" strokeWidth={1.75} />
        </HeaderButton>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          aria-label={`${title}, switch view`}
          onClick={openViewsSheet}
          className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 text-start outline-hidden focus-visible:ring-2 focus-visible:ring-ring active:bg-muted"
        >
          {context ? (
            <span className="truncate text-xs font-medium text-muted-foreground">
              {context}
            </span>
          ) : null}
          <span className="flex min-w-0 items-center gap-1">
            <h1 className="truncate text-[17px] leading-5.5 font-semibold tracking-[-0.01em] text-foreground">
              {title}
            </h1>
            {views.current && views.edited ? (
              <span
                role="img"
                aria-label="Unsaved changes"
                className="size-1.5 shrink-0 rounded-full bg-sidebar-primary"
              />
            ) : null}
            <ChevronDownIcon className="size-4 shrink-0 text-foreground" />
          </span>
        </button>
        <HeaderButton label="Search" onClick={openPalette}>
          <SearchIcon className="size-5" strokeWidth={1.75} />
        </HeaderButton>
        <HeaderButton
          label={
            active ? `View and filter, ${active} active` : "View and filter"
          }
          onClick={() => setOpen(true)}
        >
          <ListFilterIcon className="size-5" strokeWidth={1.75} />
          {active ? (
            <span
              aria-hidden="true"
              className="absolute end-1.25 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-primary px-1 text-meta leading-4 font-semibold text-white ring-2 ring-background"
            >
              {active}
            </span>
          ) : null}
        </HeaderButton>
      </header>
      <MobileViewsSheet
        project={views.project}
        views={views.list}
        current={views.current}
        edited={views.edited}
      />
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="md:hidden">
          <DrawerHeader>
            <DrawerTitle>View &amp; filter</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto pb-6 [&>div]:px-4">{children}</div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon-touch"
      aria-label={label}
      onClick={onClick}
      className="relative"
    >
      {children}
    </Button>
  )
}
