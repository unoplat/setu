import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { defaultFilter } from "cmdk"
import {
  FlagIcon,
  FolderIcon,
  LayoutGridIcon,
  LinkIcon,
  SearchIcon,
  SquareCheckIcon,
} from "lucide-react"

import { HotkeyHint } from "@/components/hotkey-hint"
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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useDebounce } from "@/hooks/use-debounce"
import { useCommandActions } from "@/lib/command-actions"
import {
  COMMAND_GROUPS,
  listCommands,
  useCommand,
  type CommandDefinition,
} from "@/lib/commands"
import { displayHost, linkIconElement } from "@/lib/links"
import { useProjects } from "@/lib/projects"
import {
  groupResults,
  isSearchable,
  nameLeads,
  useRecordSearch,
  type ExcerptPart,
  type RecordType,
  type SearchResult,
} from "@/lib/search"

// Typing settles for this long before the server is asked.
const SEARCH_DELAY_MS = 150

const RECORD_ICONS: Record<RecordType, React.ReactNode> = {
  task: <SquareCheckIcon />,
  module: <LayoutGridIcon />,
  milestone: <FlagIcon />,
  link: <LinkIcon />,
}

/**
 * Sidebar search row and the ⌘K dialog (Paper: search-experience, A).
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
 */
export function NavSearch() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState("")
  const navigate = useNavigate()
  const actions = useCommandActions()
  const { data: projects } = useProjects()
  const settled = useDebounce(query, SEARCH_DELAY_MS)
  const search = useRecordSearch(settled)

  // Every open and close starts with an empty query.
  function setPalette(next: boolean) {
    setOpen(next)
    setQuery("")
  }
  useCommand("palette.open", () => {
    setOpen((value) => !value)
    setQuery("")
  })

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
  const response = searching ? search.data?.message : undefined
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

  function run(command: CommandDefinition) {
    setPalette(false)
    actions[command.id]?.()
  }

  function openRecord(result: SearchResult) {
    setPalette(false)
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
              onSelect={() => {
                setPalette(false)
                void navigate({
                  to: "/projects/$name",
                  params: { name: project.name },
                })
              }}
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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          variant="outline"
          tooltip="Search"
          onClick={() => setPalette(true)}
          className="text-muted-foreground"
        >
          <SearchIcon />
          <span className="truncate">Search</span>
          {/* Kbd defaults to bg-muted, which equals the button's hover colour. */}
          <HotkeyHint
            command="palette.open"
            className="ms-auto group-data-[collapsible=icon]:hidden **:data-[slot=kbd]:group-hover/menu-button:bg-background"
          />
        </SidebarMenuButton>
        <CommandDialog
          open={open}
          onOpenChange={setPalette}
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
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function recordValue(result: SearchResult): string {
  return `${result.type}:${result.name}`
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
      {/* A link wears its type's icon. */}
      {result.type === "link"
        ? linkIconElement(result.icon)
        : RECORD_ICONS[result.type]}
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
  if (!parts.length) return null
  return (
    <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">
      {parts.map((part, index) =>
        part.match ? (
          <mark
            // Parts are positional: the same text can match twice.
            key={index}
            className="bg-transparent font-medium text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        )
      )}
    </span>
  )
}
