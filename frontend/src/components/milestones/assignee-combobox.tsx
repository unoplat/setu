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
import { propertyTriggerClassName } from "@/lib/style"

import { AssigneeAvatar } from "./assignee-avatar"

// shadcn's "Combobox in Popup": the field is a button showing who is
// assigned, and the search box lives in the popup. The form keeps the user
// id; the combobox works with the whole person so it can show the avatar.
export function AssigneeCombobox({
  id,
  value,
  onChange,
  onBlur,
  current = null,
  variant = "field",
  emptyLabel = "Unassigned",
}: {
  id: string
  /** A Frappe user id, or "" for nobody. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /**
   * The person already assigned, shown even when the list leaves them out
   * (a disabled user, or past the list's limit) rather than "Unassigned".
   */
  current?: Assignee | null
  /**
   * "field": the full-width outlined field of a form (06a). "inline": a
   * property's quiet value on the milestone page (06d).
   */
  variant?: "field" | "inline"
  /** What the field says with nobody picked ("No lead" on a module). */
  emptyLabel?: string
}) {
  const inline = variant === "inline"
  const { data, isLoading } = useAssignees()
  const people = data?.message ?? []
  const selected =
    people.find((person) => person.name === value) ??
    (current?.name === value ? current : null)

  return (
    <Combobox
      items={people}
      value={selected}
      onValueChange={(person) => onChange(person?.name ?? "")}
      itemToStringLabel={(person) => person.full_name || person.name}
      itemToStringValue={(person) => person.name}
      isItemEqualToValue={(item, current) => item.name === current.name}
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
    >
      <ComboboxTrigger
        render={
          <Button
            id={id}
            type="button"
            variant={inline ? "ghost" : "outline"}
            disabled={isLoading}
            className={
              inline
                ? // ComboboxTrigger draws its own chevron; 06d's is 12px.
                  `${propertyTriggerClassName} gap-2 [&>svg:last-child]:size-3`
                : "h-11 w-full justify-between gap-2 rounded-xl px-3.5 font-normal"
            }
          />
        }
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <AssigneeAvatar person={selected} />
            <span className={inline ? "wrap-anywhere" : "truncate"}>
              {selected.full_name || selected.name}
            </span>
          </span>
        ) : (
          <span className="grow text-start text-muted-foreground">
            {isLoading ? "Loading people…" : emptyLabel}
          </span>
        )}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput
          showTrigger={false}
          showClear={selected !== null}
          placeholder="Search people"
        />
        <ComboboxEmpty>No one matches.</ComboboxEmpty>
        <ComboboxList>
          {(person: Assignee) => (
            <ComboboxItem key={person.name} value={person}>
              <AssigneeAvatar person={person} />
              <span className="truncate">
                {person.full_name || person.name}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
