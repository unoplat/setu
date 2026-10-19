import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { isInboxFilter, type InboxCounts, type InboxFilter } from "@/lib/inbox"
import {
  useInboxFilter,
  useInboxProject,
  useInboxUnreadOnly,
  useInboxViewActions,
} from "@/lib/inbox-store"
import { useProjects } from "@/lib/projects"
import { cn } from "@/lib/utils"

// Paper 10c, "Filter Bar": the type chips with their unread counts and
// "Unread only" on the left, the project picker on the right. Each writes
// the page's view (lib/inbox-store.ts), which keys the rows' fetch.

/**
 * 10c's 28px pill: outlined and muted, filled with the foreground once
 * pressed. Base UI marks a pressed toggle with aria-pressed and
 * data-pressed, so the pressed look is keyed on aria-pressed.
 */
const CHIP_CLASS =
  "h-7 text-muted-foreground aria-pressed:border-transparent aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/90 aria-pressed:hover:text-background"

const FILTER_CHIPS: readonly {
  value: InboxFilter
  label: string
  count: keyof InboxCounts
}[] = [
  { value: "all", label: "All", count: "unread" },
  { value: "assigned", label: "Assigned", count: "assigned" },
  { value: "mentions", label: "Mentions", count: "mentions" },
]

export function InboxFilters({
  counts,
}: {
  /** Records with anything unread, under the project filter. */
  counts: InboxCounts | undefined
}) {
  const filter = useInboxFilter()
  const unreadOnly = useInboxUnreadOnly()
  const { filterChosen, unreadOnlyToggled } = useInboxViewActions()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleGroup
          aria-label="Show"
          variant="outline"
          size="sm"
          spacing={1.5}
          value={[filter]}
          onValueChange={(value) => {
            // Pressing the chip that is on asks for none; one stays chosen.
            const next = value[0]
            if (next !== undefined && isInboxFilter(next)) filterChosen(next)
          }}
        >
          {FILTER_CHIPS.map((chip) => (
            <ToggleGroupItem
              key={chip.value}
              value={chip.value}
              className={CHIP_CLASS}
            >
              {chip.label}
              <ChipCount
                value={counts?.[chip.count]}
                accent={chip.value === "mentions"}
              />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle
          variant="outline"
          size="sm"
          className={CHIP_CLASS}
          pressed={unreadOnly}
          onPressedChange={unreadOnlyToggled}
        >
          Unread only
        </Toggle>
      </div>
      <ProjectPicker />
    </div>
  )
}

/**
 * A chip's count of unread records, left out at zero. Mentions' is in the
 * accent colour, as 10c draws it, until its chip is pressed.
 */
function ChipCount({
  value,
  accent,
}: {
  value: number | undefined
  accent: boolean
}) {
  if (!value) return null
  return (
    <span
      className={cn(
        "text-meta font-semibold tabular-nums group-aria-pressed/toggle:text-background group-aria-pressed/toggle:opacity-60",
        accent ? "text-sidebar-primary" : "text-muted-foreground"
      )}
    >
      {value}
    </span>
  )
}

/** Every project, or one of the open Envision Projects the sidebar lists. */
function ProjectPicker() {
  const project = useInboxProject()
  const { projectChosen } = useInboxViewActions()
  const { data: projects } = useProjects()
  const items = [
    { value: null, label: "All projects" },
    ...(projects ?? []).map((entry) => ({
      value: entry.name,
      label: entry.project_name,
    })),
  ]
  return (
    <Select
      items={items}
      value={project}
      onValueChange={(next) => projectChosen(next)}
    >
      <SelectTrigger
        size="sm"
        aria-label="Project"
        className="h-7 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value ?? ""} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
