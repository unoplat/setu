import { GlobeIcon, LockIcon } from "lucide-react"

import { PickerTrigger } from "@/components/app-ui/field-controls"
import { PickerContent } from "@/components/app-ui/picker-content"
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import type { RepositoryDetails } from "@/lib/github"
import { cn } from "@/lib/utils"

/** "owner/" quiet, the repository's own name in full. */
function RepositoryName({
  repository,
  className,
}: {
  repository: RepositoryDetails
  className?: string
}) {
  const slash = repository.full_name.indexOf("/")
  const owner = slash > 0 ? repository.full_name.slice(0, slash + 1) : ""
  const name =
    slash > 0 ? repository.full_name.slice(slash + 1) : repository.full_name
  return (
    <span className={cn("truncate", className)}>
      <span className="text-muted-foreground">{owner}</span>
      {name}
    </span>
  )
}

function VisibilityIcon({ isPrivate }: { isPrivate: boolean }) {
  const Icon = isPrivate ? LockIcon : GlobeIcon
  return (
    <Icon
      aria-label={isPrivate ? "Private" : "Public"}
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  )
}

// A "Combobox in Popup" for the one repository a Project connects to. The
// list is the GitHub App's repositories no other Project uses; typing
// filters on "owner/name", so either half finds it.
export function RepositoryCombobox({
  id,
  repositories,
  value,
  onChange,
  onBlur,
  disabled = false,
  invalid = false,
}: {
  id: string
  repositories: RepositoryDetails[]
  /** GitHub's repository ID, or "" when none is picked. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  invalid?: boolean
}) {
  const selected =
    repositories.find((repository) => repository.id === value) ?? null

  return (
    <Combobox
      items={repositories}
      value={selected}
      onValueChange={(repository) => onChange(repository?.id ?? "")}
      itemToStringLabel={(repository) => repository.full_name}
      itemToStringValue={(repository) => repository.id}
      isItemEqualToValue={(item, current) => item.id === current.id}
      autoHighlight
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
      disabled={disabled}
    >
      <ComboboxTrigger
        render={
          <PickerTrigger
            id={id}
            type="button"
            aria-invalid={invalid ? true : undefined}
          />
        }
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <VisibilityIcon isPrivate={selected.private} />
            <RepositoryName repository={selected} />
          </span>
        ) : (
          <span className="grow text-start text-muted-foreground">
            Choose a repository
          </span>
        )}
      </ComboboxTrigger>
      <PickerContent>
        <ComboboxInput showTrigger={false} placeholder="Search repositories" />
        <ComboboxEmpty>No repository matches.</ComboboxEmpty>
        <ComboboxList>
          {(repository: RepositoryDetails) => (
            <ComboboxItem key={repository.id} value={repository}>
              <VisibilityIcon isPrivate={repository.private} />
              <RepositoryName repository={repository} className="grow" />
            </ComboboxItem>
          )}
        </ComboboxList>
      </PickerContent>
    </Combobox>
  )
}
