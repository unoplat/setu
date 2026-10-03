import * as React from "react"
import {
  ArrowUpIcon,
  FlagIcon,
  ListFilterIcon,
  TagIcon,
  UserIcon,
} from "lucide-react"

import { Filters } from "@/components/reui/filters/filters"
import {
  createFilterQuery,
  createFilterRule,
  flattenFilterRules,
} from "@/components/reui/filters/filters-query"
import type {
  FilterField,
  FilterOperator,
  FilterQuery,
} from "@/components/reui/filters/filters-types"
import { Button } from "@/components/ui/button"
import type { Assignee } from "@/lib/assignees"
import type { Milestone } from "@/lib/milestones"
import {
  sameFilters,
  TASK_FILTER_FIELDS,
  toTaskFilters,
  type TaskFilters,
} from "@/lib/task-filters"
import { TASK_PRIORITIES } from "@/lib/tasks"

// Paper: CV 01 — Filter the board. The "Filter" button and the filter chips
// are ReUI Filters (@reui/filters, shadcn registry), a chip row driven by a
// query tree. The Board needs far less than a tree: each field holds the
// values a Task may have, so every field offers the one operator "is any of"
// and its chip reads "Priority  Urgent, High".

type Values = string[]

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
  milestones,
  people,
  tags,
}: {
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  milestones: readonly Pick<Milestone, "name" | "subject">[]
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
      id: (typeof TASK_FILTER_FIELDS)[number],
      label: string,
      icon: React.ReactNode,
      options: { value: string; label: string }[]
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
    return [
      field(
        "milestone",
        "Milestone",
        <FlagIcon />,
        milestones.map((m) => ({ value: m.name, label: m.subject }))
      ),
      field(
        "priority",
        "Priority",
        <ArrowUpIcon />,
        // Highest first, as people pick what needs attention.
        TASK_PRIORITIES.toReversed().map((p) => ({ value: p, label: p }))
      ),
      field(
        "assignee",
        "Assignee",
        <UserIcon />,
        people.map((p) => ({ value: p.name, label: p.full_name || p.name }))
      ),
      field(
        "tag",
        "Tag",
        <TagIcon />,
        tags.map((tag) => ({ value: tag, label: tag }))
      ),
    ]
  }, [milestones, people, tags, query])

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
