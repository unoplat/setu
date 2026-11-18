import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import {
  ArrowRightIcon,
  BellIcon,
  CircleXIcon,
  FolderIcon,
  FolderPlusIcon,
  RotateCwIcon,
  SearchIcon,
  SettingsIcon,
  SquareCheckIcon,
  SunMoonIcon,
} from "lucide-react"

import { StatusDot } from "@/components/app-ui/status-dot"
import { MatchedText, RecordIcon } from "@/components/search/search-parts"
import { Button } from "@/components/ui/button"
import { CommandList } from "@/components/ui/command"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFullscreenContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useVisualViewport } from "@/hooks/use-visual-viewport"
import type { CommandDefinition, CommandGroup, CommandId } from "@/lib/commands"
import { displayHost } from "@/lib/links"
import type { ProjectSummary } from "@/lib/projects"
import {
  matchParts,
  recordValue,
  type groupResults,
  type SearchResult,
} from "@/lib/search"
import { statusColumn } from "@/lib/tasks"
import { cn } from "@/lib/utils"

// Search on a phone (Paper: mobile-views, Search · 1 Opened, 2 Results,
// 3 Loading, 5 No results, 6 Error, 10 Back / close). The same search as the
// ⌘K dialog (search-palette.tsx owns the query, the answers and what a pick
// does); only the shell differs:
// - The whole screen, sized to what the keyboard leaves visible
//   (visualViewport), so no result sits under the keyboard.
// - A 16px input, so iOS does not zoom in, with a clear button and Cancel.
// - Rows of at least 52px: the title on up to two lines, the query's words
//   marked, and under it what Search returns: ID · project · Status for a
//   Task, ID · project for a milestone, the project for a module, host ·
//   project for a link. No keycaps.
// - No query: Projects, Actions, then Create.
// - Placeholder rows until a query's first answer arrives; later ones keep
//   the list and turn the search icon into a spinner.
// - An index still being built shows the Error screen too: Search cannot
//   answer yet, and Try again asks again.

const COMMAND_ICONS: Partial<Record<CommandId, React.ReactNode>> = {
  "nav.projects": <FolderIcon />,
  "nav.myTasks": <SquareCheckIcon />,
  "nav.inbox": <BellIcon />,
  "nav.settings": <SettingsIcon />,
  "theme.toggle": <SunMoonIcon />,
  "project.new": <FolderPlusIcon />,
}

// The command group that only creates things; Search lists it as "Create".
const CREATE_GROUP: CommandGroup = "Projects"

const GROUP_CLASS =
  "**:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-compact **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-muted-foreground"

// The highlight follows a keyboard; on touch it would only mark the first row.
const ROW_CLASS =
  "flex min-h-13 cursor-default gap-3 px-4 outline-hidden select-none active:bg-muted pointer-fine:data-selected:bg-muted"

export interface PhoneSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  highlighted: string
  onHighlight: (value: string) => void
  projects: ProjectSummary[]
  commands: CommandDefinition[]
  recordGroups: ReturnType<typeof groupResults>
  /** A project or action name starts with the query, so they lead. */
  namesLead: boolean
  /** A newer answer is on its way. */
  pending: boolean
  /** The query is long enough to search records (two letters). */
  searching: boolean
  /** No answer yet for this query in this opening. */
  firstAnswerPending: boolean
  /** The search failed, or its index is still being built. */
  unavailable: boolean
  /** The spelling Search used when the query as typed found nothing. */
  correctedQuery: string | null
  onRetry: () => void
  onOpenProject: (project: ProjectSummary) => void
  onRunCommand: (command: CommandDefinition) => void
  onOpenRecord: (result: SearchResult) => void
}

export function PhoneSearch(props: PhoneSearchProps) {
  const { open, onOpenChange, query, highlighted, onHighlight } = props
  const inputRef = React.useRef<HTMLInputElement>(null)
  const text = query.trim()
  const recordCount = props.recordGroups.reduce(
    (sum, group) => sum + group.results.length,
    0
  )
  const nameCount = props.projects.length + props.commands.length
  const loading = !props.unavailable && props.firstAnswerPending
  // Records are only listed for the answer on screen; never under an error.
  const showRecords = !props.unavailable && !loading
  // Nothing matched at all: no record, project or action.
  const nothing =
    text !== "" &&
    !props.unavailable &&
    !loading &&
    !props.pending &&
    recordCount + nameCount === 0

  return (
    <SearchFrame open={open} onOpenChange={onOpenChange} inputRef={inputRef}>
      <CommandPrimitive
        label="Search"
        shouldFilter={false}
        value={highlighted}
        onValueChange={onHighlight}
        onKeyDown={closeKeyboardOnTouch}
        className="flex min-h-0 flex-1 flex-col"
      >
        <SearchField
          inputRef={inputRef}
          query={query}
          onQueryChange={props.onQueryChange}
          pending={props.pending}
        />
        <SearchState
          text={text}
          unavailable={props.unavailable}
          nothing={nothing}
          correctedQuery={showRecords ? props.correctedQuery : null}
          hasRecords={recordCount > 0}
          onRetry={props.onRetry}
        />
        <CommandList className="max-h-none min-h-0 flex-1 overscroll-contain">
          {/* Room for the home indicator under the last row. */}
          <div className="pb-safe-bottom">
            <SearchLists
              {...props}
              terms={props.correctedQuery ?? text}
              loading={loading}
              showRecords={showRecords}
              divided={text === ""}
            />
          </div>
        </CommandList>
      </CommandPrimitive>
      <p aria-live="polite" className="sr-only">
        {announcement({
          text,
          unavailable: props.unavailable,
          loading,
          count: (showRecords ? recordCount : 0) + nameCount,
        })}
      </p>
    </SearchFrame>
  )
}

/**
 * On a touch screen the keyboard's "search" key closes the keyboard rather
 * than opening a row the user cannot see highlighted; a row opens on a tap.
 */
function closeKeyboardOnTouch(event: React.KeyboardEvent) {
  if (event.key !== "Enter") return
  if (!window.matchMedia("(pointer: coarse)").matches) return
  event.preventDefault()
  ;(event.target as HTMLElement).blur()
}

/** The full-screen layer, sized to what the on-screen keyboard leaves. */
function SearchFrame({
  open,
  onOpenChange,
  inputRef,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Focused as Search opens; focus goes back to the opener as it closes. */
  inputRef: React.RefObject<HTMLInputElement | null>
  children: React.ReactNode
}) {
  const viewport = useVisualViewport(open)
  const size = {
    "--dialog-h":
      viewport.height === undefined ? undefined : `${viewport.height}px`,
    "--dialog-top":
      viewport.top === undefined ? undefined : `${viewport.top}px`,
  } as React.CSSProperties
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFullscreenContent initialFocus={inputRef} style={size}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search tasks, modules, milestones, links, projects and actions
        </DialogDescription>
        {children}
      </DialogFullscreenContent>
    </Dialog>
  )
}

/** The 56px top row: the search field and Cancel. */
function SearchField({
  inputRef,
  query,
  onQueryChange,
  pending,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  query: string
  onQueryChange: (query: string) => void
  pending: boolean
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border ps-4 pe-1">
      <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md bg-muted ps-3 ring-1 ring-transparent ring-inset focus-within:ring-sidebar-primary">
        {/* One box for the icon and the spinner, so the text never shifts. */}
        <span className="flex size-4.5 shrink-0 items-center justify-center text-muted-foreground">
          {pending ? (
            <span className="flex text-sidebar-primary">
              <Spinner aria-hidden="true" role="presentation" />
            </span>
          ) : (
            <SearchIcon aria-hidden="true" className="size-4.5" />
          )}
        </span>
        <CommandPrimitive.Input
          ref={inputRef}
          value={query}
          onValueChange={onQueryChange}
          placeholder="Search tasks, projects…"
          enterKeyHint="search"
          inputMode="search"
          autoCapitalize="off"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-hidden placeholder:text-muted-foreground"
        />
        {query ? (
          // Inside the field, so not a Button: it has no surface of its own.
          <button
            type="button"
            aria-label="Clear search"
            className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
            onClick={() => {
              onQueryChange("")
              inputRef.current?.focus()
            }}
          >
            <CircleXIcon className="size-4.5" />
          </button>
        ) : (
          <span className="w-1 shrink-0" />
        )}
      </div>
      <DialogClose render={<Button variant="text" size="touch" />}>
        Cancel
      </DialogClose>
    </div>
  )
}

/** What Search says above the list: an error, no matches, a spelling fix. */
function SearchState({
  text,
  unavailable,
  nothing,
  correctedQuery,
  hasRecords,
  onRetry,
}: {
  text: string
  unavailable: boolean
  nothing: boolean
  correctedQuery: string | null
  hasRecords: boolean
  onRetry: () => void
}) {
  if (unavailable) {
    return (
      <div className="flex shrink-0 flex-col items-start gap-4 px-4 pt-10 pb-6">
        <p className="text-lg font-semibold">
          Search isn’t available right now.
        </p>
        <Button variant="outline" size="touch" onClick={onRetry}>
          <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      </div>
    )
  }
  if (nothing) {
    return (
      <div className="flex shrink-0 flex-col gap-1.5 px-4 pt-10">
        <p className="text-lg font-semibold">No matches for “{text}”</p>
        <p className="text-sm text-muted-foreground">
          Check the spelling or try fewer words.
        </p>
      </div>
    )
  }
  if (correctedQuery && hasRecords) {
    return (
      <p className="shrink-0 px-4 pt-3 text-xs text-muted-foreground">
        Showing results for “{correctedQuery}”
      </p>
    )
  }
  return null
}

/** Records grouped by kind, then Projects, Actions and Create. */
function SearchLists({
  projects,
  commands,
  recordGroups,
  namesLead,
  terms,
  loading,
  showRecords,
  divided,
  onOpenProject,
  onRunCommand,
  onOpenRecord,
}: PhoneSearchProps & {
  terms: string
  loading: boolean
  showRecords: boolean
  /** Without a query the three lists are set apart by a line. */
  divided: boolean
}) {
  const groupClass = cn(
    GROUP_CLASS,
    divided && "border-t border-border first:border-t-0"
  )
  const records = loading ? (
    <LoadingRows />
  ) : showRecords ? (
    recordGroups.map((group) => (
      <CommandPrimitive.Group
        key={group.type}
        heading={group.heading}
        className={GROUP_CLASS}
      >
        {group.results.map((result) => (
          <RecordRow
            key={recordValue(result)}
            result={result}
            terms={terms}
            onSelect={() => onOpenRecord(result)}
          />
        ))}
      </CommandPrimitive.Group>
    ))
  ) : null

  const lists = [
    {
      heading: "Projects",
      rows: projects.map((project) => (
        <NameRow
          key={project.name}
          value={`project:${project.name}`}
          icon={<FolderIcon />}
          onSelect={() => onOpenProject(project)}
        >
          {project.project_name}
        </NameRow>
      )),
    },
    ...[
      {
        heading: "Actions",
        list: commands.filter((c) => c.group !== CREATE_GROUP),
      },
      {
        heading: "Create",
        list: commands.filter((c) => c.group === CREATE_GROUP),
      },
    ].map(({ heading, list }) => ({
      heading,
      rows: list.map((command) => (
        <NameRow
          key={command.id}
          value={`command:${command.id}`}
          icon={COMMAND_ICONS[command.id] ?? <ArrowRightIcon />}
          onSelect={() => onRunCommand(command)}
        >
          {command.title}
        </NameRow>
      )),
    })),
  ]
  const others = lists
    .filter((entry) => entry.rows.length > 0)
    .map((entry) => (
      <CommandPrimitive.Group
        key={entry.heading}
        heading={entry.heading}
        className={groupClass}
      >
        {entry.rows}
      </CommandPrimitive.Group>
    ))

  return namesLead ? (
    <>
      {others}
      {records}
    </>
  ) : (
    <>
      {records}
      {others}
    </>
  )
}

function announcement({
  text,
  unavailable,
  loading,
  count,
}: {
  text: string
  unavailable: boolean
  loading: boolean
  count: number
}): string {
  if (!text) return ""
  if (unavailable) return "Search isn’t available right now."
  if (loading) return "Searching"
  if (count === 0) return "No results"
  return count === 1 ? "1 result" : `${count} results`
}

function NameRow({
  value,
  icon,
  onSelect,
  children,
}: {
  value: string
  icon: React.ReactNode
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className={cn(ROW_CLASS, "items-center")}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted [&_svg]:size-4.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-subtitle font-medium">
        {children}
      </span>
    </CommandPrimitive.Item>
  )
}

/** A task, module, milestone or link: its title and where it belongs. */
function RecordRow({
  result,
  terms,
  onSelect,
}: {
  result: SearchResult
  terms: string
  onSelect: () => void
}) {
  const project = result.project_name ?? result.project
  const status =
    result.type === "task" && result.status
      ? statusColumn(result.status)
      : undefined
  const meta = [
    result.type === "task" || result.type === "milestone" ? (
      <span key="id" className="font-mono">
        {result.name}
      </span>
    ) : null,
    result.type === "link" && result.host ? displayHost(result.host) : null,
    project,
    result.type === "task" && result.status ? (
      <span key="status" className="inline-flex items-center gap-1.5">
        <StatusDot color={status?.color} />
        {status?.title ?? result.status}
      </span>
    ) : null,
  ].filter((part) => part !== null)

  return (
    <CommandPrimitive.Item
      value={recordValue(result)}
      onSelect={onSelect}
      className={cn(ROW_CLASS, "py-2")}
    >
      <span className="flex h-5 w-8 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4.5">
        <RecordIcon result={result} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <MatchedText
          parts={matchParts(result.title, terms)}
          className="line-clamp-2 text-subtitle"
          markClassName="bg-transparent font-bold text-foreground"
        />
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {meta.map((part, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <span aria-hidden="true">·</span> : null}
              {part}
            </React.Fragment>
          ))}
        </span>
      </span>
    </CommandPrimitive.Item>
  )
}

/** Three placeholder rows under Tasks until a query's first answer arrives. */
function LoadingRows() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      <p className="px-4 pt-3 pb-1.5 text-compact font-semibold text-muted-foreground">
        Tasks
      </p>
      <LoadingRow title={<Skeleton className="h-3 w-4/5" />} />
      <LoadingRow title={<Skeleton className="h-3 w-2/3" />} />
      <LoadingRow title={<Skeleton className="h-3 w-3/4" />} />
    </div>
  )
}

function LoadingRow({ title }: { title: React.ReactNode }) {
  return (
    <div className="flex min-h-13 gap-3 px-4 py-2">
      <span className="flex h-5 w-8 shrink-0 items-center justify-center">
        <Skeleton className="size-4.5" />
      </span>
      <span className="flex flex-1 flex-col gap-2.5 pt-1">
        {title}
        <Skeleton className="h-2.5 w-1/2" />
      </span>
    </div>
  )
}
