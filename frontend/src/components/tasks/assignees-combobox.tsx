import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { PlusIcon } from "lucide-react"

import { AssigneeAvatar } from "@/components/milestones/assignee-avatar"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { useAssignees, type Assignee } from "@/lib/assignees"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { propertyTriggerClassName } from "@/lib/style"
import { cn } from "@/lib/utils"

// A Task's Assignees (CONTEXT.md, Assignee): everyone Frappe's Assign To has
// on it, picked like the Tags (03, 09): the field shows the people, the
// search lives in the popup, and picking someone again unassigns them. The
// form keeps user ids; `current` carries the names and avatars of the people
// already assigned, so someone the list leaves out (a disabled user, or past
// the list's limit) still shows, and can be unassigned, but not picked anew.
export function AssigneesCombobox({
  id,
  value,
  onChange,
  onBlur,
  current = [],
  variant = "field",
}: {
  id: string
  /** Frappe user ids; [] for nobody. */
  value: string[]
  onChange: (value: string[]) => void
  onBlur?: () => void
  /** The people already assigned, first assigned first. */
  current?: Assignee[]
  /**
   * "field": the full-width outlined field of Create Task (03). "inline": a
   * property's quiet value on the Task page (09).
   */
  variant?: "field" | "inline"
}) {
  const inline = variant === "inline"
  const { data, error, isLoading } = useAssignees()
  const [query, setQuery] = React.useState("")
  // Who was assigned as the popup opened: listed first, and kept in place
  // while the popup is open so a row never jumps from under the pointer.
  const [pinned, setPinned] = React.useState<string[]>([])

  const people = data?.message
  const known = React.useMemo(() => {
    const map = new Map<string, Assignee>()
    for (const person of current) map.set(person.name, person)
    for (const person of people ?? []) map.set(person.name, person)
    return map
  }, [current, people])
  const person = React.useCallback(
    (name: string): Assignee =>
      known.get(name) ?? { name, full_name: "", user_image: null },
    [known]
  )
  const label = React.useCallback(
    (name: string) => person(name).full_name || name,
    [person]
  )

  // The people as assigned, in Frappe's order, then those just picked.
  const selected = React.useMemo(() => {
    const picked = new Set(value)
    const order = current.map((p) => p.name).filter((name) => picked.has(name))
    for (const name of value) if (!order.includes(name)) order.push(name)
    return order.map(person)
  }, [current, value, person])

  // Anyone the list offers, plus the picked people it leaves out: they can
  // be unassigned, and once they are, they are gone from the popup.
  const items = React.useMemo(() => {
    const offered = (people ?? []).map((p) => p.name)
    const extra = value.filter((name) => !offered.includes(name))
    const all = [...extra, ...offered]
    const first = new Set(pinned.filter((name) => all.includes(name)))
    return [...first, ...all.filter((name) => !first.has(name))]
  }, [people, value, pinned])

  const { contains } = ComboboxPrimitive.useFilter({ multiple: true })

  return (
    <Combobox
      multiple
      items={items}
      value={value}
      onValueChange={(next) => {
        onChange(next)
        setQuery("")
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={label}
      // By name or by the user id, which is the email address.
      filter={(name: string, typed: string) =>
        contains(label(name), typed) || contains(name, typed)
      }
      autoHighlight
      onOpenChange={(open) => {
        if (open) {
          setPinned(value)
          return
        }
        setQuery("")
        onBlur?.()
      }}
    >
      <ComboboxTrigger
        render={
          <Button
            id={id}
            type="button"
            variant={inline ? "ghost" : "outline"}
            // Loading only blocks the field when it has nobody to show.
            disabled={isLoading && selected.length === 0}
            className={
              inline
                ? // A "+" says more can be added, as on the Tags.
                  cn(
                    propertyTriggerClassName,
                    "py-0.75 [&>svg:last-child]:hidden"
                  )
                : "h-auto min-h-11 w-full justify-between gap-2 rounded-xl px-3.5 py-2 font-normal"
            }
          />
        }
      >
        {selected.length ? (
          <span className="flex min-w-0 grow flex-wrap items-center gap-1.5">
            {selected.map((p) => (
              <PersonChip key={p.name} person={p} />
            ))}
            {inline ? (
              <PlusIcon className="size-3.5 text-muted-foreground" />
            ) : null}
          </span>
        ) : (
          <span className="flex grow items-center gap-2 text-muted-foreground">
            {isLoading ? "Loading people…" : "Unassigned"}
            {inline ? <PlusIcon className="size-3.5" /> : null}
          </span>
        )}
      </ComboboxTrigger>
      {/* The trigger can be a narrow rail value; names need more room. */}
      <ComboboxContent className="min-w-72">
        <ComboboxInput showTrigger={false} placeholder="Search people" />
        {error ? (
          <p className="px-4.5 pt-2.5 text-xs text-destructive" role="alert">
            {frappeErrorMessage(error)}
          </p>
        ) : null}
        <ComboboxEmpty>
          {isLoading ? "Loading people…" : "No one matches."}
        </ComboboxEmpty>
        <ComboboxList>
          {(name: string) => (
            <ComboboxItem key={name} value={name}>
              <AssigneeAvatar person={person(name)} />
              <span className="truncate">{label(name)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** One assignee in the field: avatar and name, as the milestone field shows. */
function PersonChip({ person }: { person: Assignee }) {
  return (
    <span className="flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-secondary ps-0 pe-2 text-xs font-medium text-secondary-foreground">
      <AssigneeAvatar person={person} />
      <span className="truncate">{person.full_name || person.name}</span>
    </span>
  )
}
