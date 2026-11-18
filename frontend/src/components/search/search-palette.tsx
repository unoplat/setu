import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { defaultFilter } from "cmdk"
import { useSWRConfig } from "frappe-react-sdk"
import { FolderIcon } from "lucide-react"

import { HotkeyHint } from "@/components/hotkey-hint"
import {
  enterSearchEntry,
  leaveSearchEntry,
  usePhoneSearchHistory,
} from "@/components/search/phone-history"
import { PhoneSearch } from "@/components/search/phone-search"
import { MatchedText, RecordIcon } from "@/components/search/search-parts"
import {
  closePalette,
  setPaletteOpen,
  togglePalette,
  usePaletteOpen,
  usePaletteOpenChange,
} from "@/components/search/store"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { useSidebar } from "@/components/ui/sidebar"
import { useDebounce } from "@/hooks/use-debounce"
import { useCommandActions } from "@/lib/command-actions"
import {
  COMMAND_GROUPS,
  listCommands,
  useCommand,
  type CommandDefinition,
} from "@/lib/commands"
import { displayHost } from "@/lib/links"
import { useProjects } from "@/lib/projects"
import {
  groupResults,
  isSearchable,
  isSearchKey,
  nameLeads,
  recordValue,
  useRecordSearch,
  type ExcerptPart,
  type SearchResult,
} from "@/lib/search"

// Typing settles for this long before the server is asked.
const SEARCH_DELAY_MS = 150

/**
 * The ⌘K search dialog (Paper: search-experience, A). Mounted once in the app
 * shell; the sidebar's Search row, the phone tab bar and `palette.open` open
 * it through the store (./store.ts).
 *
 * - Typing searches tasks, modules, milestones and links across projects
 *   (lib/search), grouped by kind. Projects and every registry command
 *   flagged `inPalette` are matched in the browser, as before.
 * - The server's results arrive after the projects and actions, so cmdk's own
 *   filtering is off and the list is filtered and ordered here. Names that
 *   start with the query (a project, "Go to Settings") lead; otherwise the
 *   matching records do.
 * - Shortcuts shown next to actions come from the bindings store, so they
 *   follow the user's customisations.
 * - Each opening forgets earlier search answers and shows none of them, so
 *   its searches ask the server again rather than reuse what an earlier
 *   opening was told.
 */
export function SearchPalette() {
  const open = usePaletteOpen()
  const { isMobile, openMobile, setOpenMobile } = useSidebar()
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState("")
  const navigate = useNavigate()
  const actions = useCommandActions()
  const { data: projects } = useProjects()
  // Counts openings, so an answer kept from an earlier one is never shown.
  const [opening, setOpening] = React.useState(0)
  const settled = useDebounce(query, SEARCH_DELAY_MS)
  // On a phone the app regaining focus is mostly the keyboard closing.
  const search = useRecordSearch(settled, opening, {
    revalidateOnFocus: !isMobile,
  })
  const { mutate } = useSWRConfig()

  // Every open and close starts with an empty query. Opening also forgets
  // every search answer: the cached data, and any request still in flight or
  // held for deduping, so the first search of this opening is a new request
  // and a late answer from before cannot land. `revalidate` refetches only a
  // key still in use: none once the last closing's empty query has settled
  // (SEARCH_DELAY_MS). The mutate runs synchronously, ahead of any search
  // this opening makes: the store calls this in the event that opens it,
  // whichever control did.
  usePaletteOpenChange((next) => {
    if (next) {
      setOpening((count) => count + 1)
      void mutate(isSearchKey, undefined, { revalidate: true })
      // On a phone the sidebar is a modal drawer; the palette replaces it
      // rather than opening over its focus trap.
      if (isMobile && openMobile) setOpenMobile(false)
      // Envision: on a phone, Back closes Search (phone-history.ts).
      if (isMobile) enterSearchEntry()
    } else {
      leaveSearchEntry()
    }
    setQuery("")
  })
  usePhoneSearchHistory()
  // A phone layout that takes over while Search is open (a phone rotated to
  // portrait) adds the entry then, so Back still closes Search.
  React.useEffect(() => {
    if (open && isMobile) enterSearchEntry()
  }, [open, isMobile])
  useCommand("palette.open", togglePalette)

  const text = query.trim()
  const shows = (value: string, keywords?: string[]) =>
    !text || defaultFilter(value, text, keywords) > 0

  const matchingProjects = (projects ?? []).filter((project) =>
    shows(project.project_name)
  )
  const commandGroups = COMMAND_GROUPS.map((group) => ({
    group,
    commands: listCommands().filter(
      (command) =>
        command.inPalette &&
        command.group === group &&
        shows(command.title, [command.description])
    ),
  })).filter((entry) => entry.commands.length > 0)

  const searching = isSearchable(text)
  // Only the current query's answer counts once it is long enough; below
  // that, the last answer (kept between keystrokes) is not shown.
  const response = searching ? search.response : undefined
  const recordGroups = groupResults(response?.results ?? [])
  const pending = searching && (settled.trim() !== text || search.isLoading)
  const namesLead =
    searching &&
    [
      ...matchingProjects.map((project) => project.project_name),
      ...commandGroups.flatMap((entry) =>
        entry.commands.map((command) => command.title)
      ),
    ].some((name) => nameLeads(name, text))

  const recordValues = recordGroups.flatMap((group) =>
    group.results.map(recordValue)
  )
  const otherValues = [
    ...matchingProjects.map((project) => `project:${project.name}`),
    ...commandGroups.flatMap((entry) =>
      entry.commands.map((command) => `command:${command.id}`)
    ),
  ]
  const values = namesLead
    ? [...otherValues, ...recordValues]
    : [...recordValues, ...otherValues]
  // The highlight stays where the user put it, and falls back to the first
  // row when that row is gone (results arrive or a filter drops it).
  const highlighted = values.includes(selected) ? selected : (values[0] ?? "")

  // Envision: a pick closes the palette, then acts once a phone's Search
  // history entry is gone, so Back from where it lands skips Search.
  function closeThen(act: () => void) {
    closePalette()
    leaveSearchEntry(act)
  }

  function run(command: CommandDefinition) {
    closeThen(() => actions[command.id]?.())
  }

  function openProject(name: string) {
    closeThen(() => void navigate({ to: "/projects/$name", params: { name } }))
  }

  function openRecord(result: SearchResult) {
    closeThen(() => navigateToRecord(result))
  }

  function navigateToRecord(result: SearchResult) {
    const name = result.project
    if (result.type === "task") {
      void navigate({
        to: "/projects/$name/tasks/$task",
        params: { name, task: result.name },
      })
    } else if (result.type === "module") {
      void navigate({
        to: "/projects/$name/modules/$module",
        params: { name, module: result.name },
      })
    } else if (result.type === "link") {
      void navigate({
        to: "/projects/$name/links/$link",
        params: { name, link: result.name },
      })
    } else {
      void navigate({
        to: "/projects/$name/milestones/$milestone",
        params: { name, milestone: result.name },
      })
    }
  }

  const records = recordGroups.map((group) => (
    <CommandGroup key={group.type} heading={group.heading}>
      {group.results.map((result) => (
        <RecordItem
          key={recordValue(result)}
          result={result}
          onSelect={() => openRecord(result)}
        />
      ))}
    </CommandGroup>
  ))

  const others = (
    <>
      {matchingProjects.length ? (
        <CommandGroup heading="Projects">
          {matchingProjects.map((project) => (
            <CommandItem
              key={project.name}
              value={`project:${project.name}`}
              onSelect={() => openProject(project.name)}
            >
              <FolderIcon />
              <span>{project.project_name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {commandGroups.map(({ group, commands }) => (
        <CommandGroup key={group} heading={group}>
          {commands.map((command) => (
            <CommandItem
              key={command.id}
              value={`command:${command.id}`}
              onSelect={() => run(command)}
            >
              <span>{command.title}</span>
              <CommandShortcut>
                <HotkeyHint command={command.id} />
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  )

  if (isMobile) {
    return (
      <PhoneSearch
        open={open}
        onOpenChange={setPaletteOpen}
        query={query}
        onQueryChange={setQuery}
        highlighted={highlighted}
        onHighlight={setSelected}
        projects={matchingProjects}
        commands={commandGroups.flatMap((entry) => entry.commands)}
        recordGroups={recordGroups}
        namesLead={namesLead}
        pending={pending}
        searching={searching}
        firstAnswerPending={searching && !response && !search.error}
        // An index still being built cannot answer yet either.
        unavailable={searching && (!!search.error || !!response?.indexing)}
        correctedQuery={response?.corrected_query ?? null}
        onRetry={search.retry}
        onOpenProject={(project) => openProject(project.name)}
        onRunCommand={run}
        onOpenRecord={openRecord}
      />
    )
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setPaletteOpen}
      title="Search"
      description="Search tasks, modules, milestones, links, projects and actions"
      className="sm:max-w-2xl"
    >
      <Command
        shouldFilter={false}
        value={highlighted}
        onValueChange={setSelected}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search tasks, modules, milestones, links & actions…"
        />
        <CommandList className="max-h-[min(28rem,60vh)]">
          <CommandEmpty>
            {emptyMessage({
              searching,
              pending,
              indexing: response?.indexing ?? false,
              failed: searching && !!search.error,
            })}
          </CommandEmpty>
          {response?.corrected_query && recordGroups.length ? (
            <p className="px-4 pt-2 text-xs text-muted-foreground">
              Showing results for “{response.corrected_query}”
            </p>
          ) : null}
          {namesLead ? (
            <>
              {others}
              {records}
            </>
          ) : (
            <>
              {records}
              {others}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

function emptyMessage({
  searching,
  pending,
  indexing,
  failed,
}: {
  searching: boolean
  pending: boolean
  indexing: boolean
  failed: boolean
}): string {
  if (searching && pending) return "Searching…"
  if (indexing) return "Search is getting ready. Try again in a minute."
  if (failed) return "Search isn’t available right now. Try again."
  return "No results found."
}

/** One task, module, milestone or link: its title, where the query matched in
 * its description (a link adds its host), and its project. */
function RecordItem({
  result,
  onSelect,
}: {
  result: SearchResult
  onSelect: () => void
}) {
  return (
    <CommandItem value={recordValue(result)} onSelect={onSelect}>
      <RecordIcon result={result} />
      <span className="max-w-[45%] shrink-0 truncate">{result.title}</span>
      {result.type === "link" && result.host ? (
        <span className="max-w-[30%] shrink-0 truncate font-normal text-muted-foreground">
          {displayHost(result.host)}
        </span>
      ) : null}
      <Excerpt parts={result.excerpt} />
      <CommandShortcut className="max-w-[30%] truncate tracking-normal">
        {result.project_name ?? result.project}
      </CommandShortcut>
    </CommandItem>
  )
}

function Excerpt({ parts }: { parts: ExcerptPart[] }) {
  return (
    <MatchedText
      parts={parts}
      className="min-w-0 flex-1 truncate font-normal text-muted-foreground"
      markClassName="bg-transparent font-medium text-foreground"
    />
  )
}
