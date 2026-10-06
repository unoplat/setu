import * as React from "react"
import { useFrappeAuth } from "frappe-react-sdk"
import {
  ArrowUpIcon,
  FlagIcon,
  FolderIcon,
  ListFilterIcon,
  LockIcon,
  TagIcon,
  UserIcon,
} from "lucide-react"

import {
  Filters,
  useFilterActions,
  useFilterRuleDisplay,
} from "@/components/reui/filters/filters"
import {
  createFilterQuery,
  createFilterRule,
  flattenFilterRules,
} from "@/components/reui/filters/filters-query"
import type {
  FilterField,
  FilterOperator,
  FilterOption,
  FilterQuery,
  FilterRule,
} from "@/components/reui/filters/filters-types"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Assignee } from "@/lib/assignees"
import {
  sameFilters,
  TASK_FILTER_FIELDS,
  toTaskFilters,
  type TaskFilterField,
  type TaskFilters,
} from "@/lib/task-filters"
import { TASK_PRIORITIES } from "@/lib/tasks"
import { cn } from "@/lib/utils"

// Paper: CV 01 — Filter the board. The "Filter" button and the filter chips
// are ReUI Filters (@reui/filters, shadcn registry), a chip row driven by a
// query tree. The Board needs far less than a tree: each field holds the
// values a Task may have, so every field offers the one operator "is any of"
// and its chip reads "Priority  Urgent, High".
//
// Paper: My Tasks 06. My tasks offers Project, Milestone, Priority and Tag:
// its milestones come from every Project, so one that shares its name with
// another's says which Project it is on.

type Values = string[]

export interface MilestoneChoice {
  name: string
  subject: string
  /** On My tasks, the milestone's Project. */
  project_name?: string
}

export interface ProjectChoice {
  name: string
  project_name: string
}

/**
 * A milestone's option: its Project under it when there is one, and in its
 * label too when another milestone has the same name, so the chip says which.
 */
function milestoneOptions(
  milestones: readonly MilestoneChoice[]
): FilterOption[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const m of milestones) {
    if (seen.has(m.subject)) repeated.add(m.subject)
    seen.add(m.subject)
  }
  return milestones.map((m) => ({
    value: m.name,
    label:
      m.project_name && repeated.has(m.subject)
        ? `${m.subject} · ${m.project_name}`
        : m.subject,
    description: m.project_name,
    keywords: m.project_name ? [m.project_name] : undefined,
  }))
}

const ANY_OF = "is_any_of"
const OPERATORS: FilterOperator[] = [
  { value: ANY_OF, label: "is any of", arity: "many" },
]

/** One rule per field that has values; the field's id is the rule's. */
function toQuery(filters: TaskFilters): FilterQuery<Values> {
  return createFilterQuery(
    TASK_FILTER_FIELDS.filter((field) => filters[field].length > 0).map(
      (field) =>
        createFilterRule<Values>({
          id: field,
          path: [field],
          operator: ANY_OF,
          value: [...filters[field]],
        })
    )
  )
}

/** A chip still waiting for its values filters nothing. */
function fromQuery(query: FilterQuery<Values>): TaskFilters {
  const values: Record<string, string[]> = {}
  for (const rule of flattenFilterRules(query)) {
    const field = rule.path[0]
    if (!field || !Array.isArray(rule.value)) continue
    values[field] = [...(values[field] ?? []), ...rule.value]
  }
  return toTaskFilters(values)
}

export function TaskFilterBar({
  filters,
  onFiltersChange,
  offered,
  projects,
  milestones,
  people,
  tags,
}: {
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  /** The fields the Filter menu offers, in order (boardFilterFields). */
  offered: readonly TaskFilterField[]
  projects: readonly ProjectChoice[]
  milestones: readonly MilestoneChoice[]
  people: readonly Assignee[]
  tags: readonly string[]
}) {
  // The bar keeps its own query, because a chip exists before it has values
  // and the filters (the URL) only know chips that do. When the filters
  // change from outside (Reset, another view, Back) the query follows.
  const [query, setQuery] = React.useState(() => toQuery(filters))
  const [seen, setSeen] = React.useState(filters)
  if (seen !== filters) {
    setSeen(filters)
    if (!sameFilters(fromQuery(query), filters)) setQuery(toQuery(filters))
  }

  const fields = React.useMemo<FilterField<Values>[]>(() => {
    // A field already on the bar is changed through its chip, not added twice.
    const used = new Set(flattenFilterRules(query).map((rule) => rule.path[0]))
    const field = (
      id: TaskFilterField,
      label: string,
      icon: React.ReactNode,
      options: FilterOption[]
    ): FilterField<Values> => ({
      id,
      label,
      icon,
      type: "select",
      operators: OPERATORS,
      defaultOperator: ANY_OF,
      options,
      disabled: used.has(id),
    })
    const all: Record<TaskFilterField, () => FilterField<Values>> = {
      project: () =>
        field(
          "project",
          "Project",
          <FolderIcon />,
          projects.map((p) => ({ value: p.name, label: p.project_name }))
        ),
      milestone: () =>
        field(
          "milestone",
          "Milestone",
          <FlagIcon />,
          milestoneOptions(milestones)
        ),
      priority: () =>
        field(
          "priority",
          "Priority",
          <ArrowUpIcon />,
          // Highest first, as people pick what needs attention.
          TASK_PRIORITIES.toReversed().map((p) => ({ value: p, label: p }))
        ),
      assignee: () =>
        field(
          "assignee",
          "Assignee",
          <UserIcon />,
          people.map((p) => ({ value: p.name, label: p.full_name || p.name }))
        ),
      tag: () =>
        field(
          "tag",
          "Tag",
          <TagIcon />,
          tags.map((tag) => ({ value: tag, label: tag }))
        ),
    }
    return offered.map((id) => all[id]())
  }, [offered, projects, milestones, people, tags, query])

  return (
    <Filters<Values>
      fields={fields}
      query={query}
      onQueryChange={(next) => {
        setQuery(next)
        const changed = fromQuery(next)
        if (!sameFilters(changed, filters)) onFiltersChange(changed)
      }}
      trigger={
        // First in the row, before its chips, as Paper has it.
        <Button variant="outline" className="order-first">
          <ListFilterIcon />
          Filter
        </Button>
      }
    />
  )
}

const LOCKED_REASON = "My tasks always shows tasks assigned to you"

/**
 * Paper: My Tasks 06, "Assignee · Me" with a lock. My tasks always shows the
 * user's own Tasks, so its Assignee filter is a chip that cannot be changed:
 * a read-only Filters bar of its own, which refuses every change, holding the
 * one rule "Assignee is any of [you]". It draws its chip itself rather than
 * through the chip row, which always adds the Add filter trigger and ends a
 * chip in a remove button where Paper has the lock.
 */
export function LockedAssigneeFilter() {
  const { currentUser } = useFrappeAuth()
  const user = currentUser ?? ""
  const field = React.useMemo<FilterField<Values>>(
    () => ({
      id: "assignee",
      label: "Assignee",
      icon: <UserIcon />,
      type: "select",
      operators: OPERATORS,
      defaultOperator: ANY_OF,
      options: [{ value: user, label: "Me" }],
    }),
    [user]
  )
  const rule = React.useMemo(
    () =>
      createFilterRule<Values>({
        id: "assignee",
        path: ["assignee"],
        operator: ANY_OF,
        value: [user],
      }),
    [user]
  )
  const fields = React.useMemo(() => [field], [field])
  const query = React.useMemo(() => createFilterQuery([rule]), [rule])
  return (
    <Filters<Values> fields={fields} query={query} readOnly>
      <LockedChip rule={rule} field={field} />
    </Filters>
  )
}

function LockedChip({
  rule,
  field,
}: {
  rule: FilterRule<Values>
  field: FilterField<Values>
}) {
  const actions = useFilterActions<Values>()
  const { pathLabel, pathText, valueLabel, valueText } = useFilterRuleDisplay<
    Values,
    unknown
  >(rule, field, OPERATORS[0])
  const segment = "cursor-default bg-background dark:bg-input/30"
  return (
    <Tooltip>
      <TooltipTrigger
        // Focusable, so the keyboard reaches the reason too.
        render={
          <ButtonGroup
            tabIndex={0}
            data-readonly=""
            aria-label={`${actions.labels.filterLabel(`${pathText} ${valueText}`)}. ${LOCKED_REASON}`}
            className="h-9 rounded-4xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <ButtonGroupText
          className={cn(segment, "gap-1.5 text-muted-foreground")}
        >
          {field.icon}
          {pathLabel}
        </ButtonGroupText>
        <ButtonGroupText className={segment}>{valueLabel}</ButtonGroupText>
        <ButtonGroupText
          aria-hidden="true"
          className={cn(
            segment,
            "w-9 justify-center px-0 text-muted-foreground"
          )}
        >
          <LockIcon />
        </ButtonGroupText>
      </TooltipTrigger>
      <TooltipContent side="bottom">{LOCKED_REASON}</TooltipContent>
    </Tooltip>
  )
}
