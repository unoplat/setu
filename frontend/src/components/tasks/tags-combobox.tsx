import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys"
import { useFrappePostCall, useSWRConfig } from "frappe-react-sdk"
import {
  CheckIcon,
  CornerDownLeftIcon,
  PlusIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatBinding, hotkey } from "@/lib/commands"
import { frappeErrorMessage } from "@/lib/frappe-error"
import { propertyTriggerClassName } from "@/lib/style"
import {
  TAGS_KEY,
  isTasksKey,
  useTagUsage,
  useTags,
  type TagUsage,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"

// Paper 03e: the highlighted tag's own key, alongside Enter (pick) and Escape
// (close). Local to the picker's search box, so it is not a rebindable command.
const DELETE_KEYS = "Mod+Backspace"
const DELETE_HOTKEY = hotkey(DELETE_KEYS)

// Paper 03: "Add tags". Tags are Frappe's site-wide document tags (CONTEXT.md,
// Tag), so the popup offers every existing one. Creating is the fallback, not
// a parallel option (Paper 03c): it appears only once the query matches no
// existing tag, and the server adds it to the site's Tag list on save. On the
// Task page (09) the field is a property's value: the tags as chips, then a +.
//
// Deleting is everywhere or not at all (03e–03g): the tag comes off every
// Task and leaves the site's list, so only those Frappe lets delete a Tag
// (System Managers) are offered it, and it asks first, in place of the list.
export function TagsCombobox({
  id,
  value,
  onChange,
  onBlur,
  variant = "field",
}: {
  id: string
  value: string[]
  onChange: (value: string[]) => void
  onBlur?: () => void
  /**
   * "field": the full-width outlined field of Create Task (03). "inline": a
   * property's quiet value on the Task page (09).
   */
  variant?: "field" | "inline"
}) {
  const inline = variant === "inline"
  const { data, isLoading } = useTags()
  const { mutate } = useSWRConfig()
  const [query, setQuery] = React.useState("")
  const typed = query.trim()
  const [highlighted, setHighlighted] = React.useState<string>()
  // The tag being confirmed (03f), and the one just deleted (03g).
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [deleted, setDeleted] = React.useState<{
    tag: string
    tasks: number
  } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const saved = data?.message.tags
  const known = React.useMemo(() => {
    // Picked tags stay listed even when they are new, so they can be unpicked.
    const all = [...(saved ?? [])]
    for (const tag of value) if (!all.includes(tag)) all.push(tag)
    return all
  }, [saved, value])
  // Filtered here rather than inside the list, so "nothing matched" and the
  // list agree on the same Intl.Collator match.
  const { contains } = ComboboxPrimitive.useFilter({ multiple: true })
  const matches = known.filter((tag) => contains(tag, typed))
  const isNew = typed !== "" && matches.length === 0
  const items = isNew ? [...known, typed] : known

  // Only a tag the site has can be deleted; a new one is just unpicked.
  const canDelete = data?.message.can_delete ?? false
  const deletable = (tag: string | undefined): tag is string =>
    canDelete && tag !== undefined && (saved ?? []).includes(tag)

  // Back from the confirm, the search box has the keyboard again.
  React.useEffect(() => {
    if (confirming === null) inputRef.current?.focus()
  }, [confirming])

  function askToDelete(tag: string) {
    setDeleted(null)
    setConfirming(tag)
  }

  async function onDeleted(tag: string, tasks: number) {
    // Refetched before the value changes, so the Task page's saved tags have
    // already lost it and its form has nothing left to save.
    await Promise.all([mutate(TAGS_KEY), mutate(isTasksKey)])
    const key = tag.toLowerCase()
    if (value.some((picked) => picked.toLowerCase() === key)) {
      onChange(value.filter((picked) => picked.toLowerCase() !== key))
    }
    setDeleted({ tag, tasks })
    setConfirming(null)
  }

  return (
    <Combobox
      multiple
      items={items}
      filteredItems={isNew ? [typed] : matches}
      autoHighlight
      value={value}
      onValueChange={(next) => {
        onChange(next)
        setQuery("")
      }}
      inputValue={query}
      onInputValueChange={(next) => {
        setQuery(next)
        setDeleted(null)
      }}
      onItemHighlighted={setHighlighted}
      onOpenChange={(open, details) => {
        // Escape in the confirm goes back to the list, not out of the picker.
        if (!open && confirming !== null && details.reason === "escape-key") {
          details.cancel()
          setConfirming(null)
          return
        }
        if (!open) {
          setQuery("")
          setConfirming(null)
          setDeleted(null)
          onBlur?.()
        }
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
                ? // A "+" says more can be added; the trigger's own chevron
                  // is not 09's.
                  cn(
                    propertyTriggerClassName,
                    "h-auto min-h-7 py-0.75 [&>svg:last-child]:hidden"
                  )
                : "h-auto min-h-11 w-full justify-between gap-2 rounded-xl px-3.5 py-2 font-normal"
            }
          />
        }
      >
        {inline ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {value.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
            {value.length === 0 ? (
              <span className="text-muted-foreground">
                {isLoading ? "Loading tags…" : "Add tags"}
              </span>
            ) : null}
            <PlusIcon className="size-3.5 text-muted-foreground" />
          </span>
        ) : value.length ? (
          <span className="flex min-w-0 grow flex-wrap gap-1.5">
            {value.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="flex grow items-center gap-2 text-muted-foreground">
            <TagIcon />
            {isLoading ? "Loading tags…" : "Add tags"}
          </span>
        )}
      </ComboboxTrigger>
      {/* The trigger is half a form column; tag names need more room. */}
      <ComboboxContent className="min-w-72">
        {/* The confirm hides the search and the list rather than unmounting
            them, so Cancel returns to the same query and highlighted tag. */}
        <ComboboxInput
          ref={inputRef}
          showTrigger={false}
          placeholder="Search or create tags"
          className={confirming !== null ? "hidden" : undefined}
          onKeyDown={(event) => {
            if (
              !deletable(highlighted) ||
              !matchesKeyboardEvent(event.nativeEvent, DELETE_KEYS)
            ) {
              return
            }
            // Not the combobox's Backspace, which unpicks the last tag.
            event.preventBaseUIHandler()
            event.preventDefault()
            askToDelete(highlighted)
          }}
        />
        {confirming !== null ? (
          <DeleteTagConfirm
            tag={confirming}
            onCancel={() => setConfirming(null)}
            onDeleted={(tasks) => onDeleted(confirming, tasks)}
          />
        ) : (
          <>
            <ComboboxEmpty>Type to create a tag.</ComboboxEmpty>
            {isNew ? (
              <p className="truncate px-4.5 pt-2.5 text-xs text-muted-foreground">
                No tags match “{typed}”
              </p>
            ) : null}
          </>
        )}
        <ComboboxList className={confirming !== null ? "hidden" : undefined}>
          {(tag: string) =>
            isNew && tag === typed ? (
              <ComboboxItem key={tag} value={tag} className="pe-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/20 text-sidebar-primary">
                  <PlusIcon className="size-3" strokeWidth={2.4} />
                </span>
                <span className="flex min-w-0 grow items-baseline gap-1.5">
                  <span className="shrink-0 font-normal text-muted-foreground">
                    Create tag
                  </span>
                  <span className="truncate">{tag}</span>
                </span>
                <Kbd className="shrink-0" aria-label="Enter">
                  <CornerDownLeftIcon className="size-3" />
                </Kbd>
              </ComboboxItem>
            ) : (
              <ComboboxItem key={tag} value={tag}>
                <span className="truncate">{tag}</span>
                {highlighted === tag && deletable(tag) ? (
                  <DeleteTagButton onPress={() => askToDelete(tag)} />
                ) : null}
              </ComboboxItem>
            )
          }
        </ComboboxList>
        {confirming === null &&
        (deleted || (canDelete && matches.length > 0)) ? (
          <div className="mx-1.5 flex items-center justify-between gap-3 border-t px-2.5 pt-2.5 pb-3 text-xs text-muted-foreground">
            {deleted ? (
              <span className="flex min-w-0 items-center gap-1.5" role="status">
                <CheckIcon className="size-3.5 shrink-0 text-success" />
                <span className="truncate">
                  Deleted “{deleted.tag}”
                  {deleted.tasks ? ` from ${count(deleted.tasks, "task")}` : ""}
                </span>
              </span>
            ) : (
              <span className="min-w-0 truncate">
                Type a name that isn’t listed to create a new tag.
              </span>
            )}
            {deletable(highlighted) ? (
              <span className="flex shrink-0 items-center gap-1.5">
                <Kbd>{formatBinding(DELETE_HOTKEY)}</Kbd>
                Delete
              </span>
            ) : null}
          </div>
        ) : null}
      </ComboboxContent>
    </Combobox>
  )
}

/** 09's tag: a small muted chip, on the Task page's Tags row. */
export function TagChip({ tag }: { tag: string }) {
  return (
    <span className="flex h-5.5 items-center rounded-sm bg-muted px-2 text-xs font-medium">
      {tag}
    </span>
  )
}

/** The highlighted row's trash (03e). Pressing it must not pick the row. */
function DeleteTagButton({ onPress }: { onPress: () => void }) {
  const keep = (event: React.SyntheticEvent) => event.stopPropagation()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Delete tag everywhere"
            // Its own lane, before the check, and no taller than the row.
            className="-my-0.5 ms-auto flex size-6 shrink-0 items-center justify-center rounded-sm bg-destructive/15 transition-colors hover:bg-destructive/25"
            onPointerDown={keep}
            onPointerUp={keep}
            onMouseUp={keep}
            onMouseDown={(event) => {
              // The search box keeps focus, so ⌘⌫ and Escape still work.
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onPress()
            }}
          />
        }
      >
        {/* The highlighted row recolours everything in it; not this. */}
        <Trash2Icon className="size-3.5 text-destructive!" />
      </TooltipTrigger>
      <TooltipContent>
        Delete tag everywhere
        <Kbd>{formatBinding(DELETE_HOTKEY)}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Paper 03f: the confirm, in place of the list. Enter deletes (the button has
 * focus); Escape and Cancel go back to the list.
 */
function DeleteTagConfirm({
  tag,
  onCancel,
  onDeleted,
}: {
  tag: string
  onCancel: () => void
  onDeleted: (tasks: number) => Promise<void>
}) {
  const usage = useTagUsage(tag)
  const remove = useFrappePostCall<{ message: { tasks: number } }>(
    "setu.api.task.delete_tag"
  )
  const [deleting, setDeleting] = React.useState(false)
  const titleId = React.useId()
  const bodyId = React.useId()

  async function confirm() {
    if (deleting) return
    setDeleting(true)
    const response = await remove.call({ tag }).catch(() => null)
    if (response) await onDeleted(response.message.tasks)
    else setDeleting(false)
  }

  const error = remove.error ?? usage.error
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="flex flex-col"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        } else if (event.key !== "Tab") {
          // Enter is the focused button's; the combobox's would pick a tag.
          event.stopPropagation()
        }
      }}
    >
      <div className="flex flex-col gap-1.5 px-4 pt-4.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-destructive/15 text-destructive">
            <Trash2Icon className="size-3.5" />
          </span>
          <p
            id={titleId}
            className="min-w-0 text-[15px] leading-5 font-semibold tracking-[-0.01em] wrap-anywhere"
          >
            Delete “{tag}” everywhere?
          </p>
        </div>
        <p
          id={bodyId}
          className="ps-9.5 text-[13px] leading-4.75 text-muted-foreground"
        >
          {usageText(usage.data?.message)}
        </p>
        {error ? (
          <p className="ps-9.5 text-[13px] leading-4.75 text-destructive">
            {frappeErrorMessage(error)}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2 p-4">
        <Button
          type="button"
          variant="outline"
          className="h-8.5 gap-2 px-3.5 text-[13px]"
          onClick={onCancel}
        >
          Cancel
          <span className="text-[11px] font-normal text-muted-foreground">
            Esc
          </span>
        </Button>
        <Button
          type="button"
          // Focused, so Enter deletes. Never disabled: a disabled button
          // drops focus, and the picker would close.
          autoFocus
          aria-disabled={deleting || undefined}
          className="h-8.5 gap-2 bg-destructive px-4 text-[13px] font-semibold text-background hover:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/30 aria-disabled:opacity-60"
          onClick={() => void confirm()}
        >
          {deleting ? "Deleting…" : "Delete tag"}
          <CornerDownLeftIcon className="size-3 opacity-60" />
        </Button>
      </div>
    </div>
  )
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

/** 03f's body: where the tag is, all of which it comes off. */
function usageText(usage: TagUsage | undefined): string {
  if (!usage) return "Checking where it’s used…"
  const places: string[] = []
  if (usage.tasks) {
    // Counts, not names: the confirm says how much, not where.
    const across = usage.projects
      ? ` across ${count(usage.projects, "project")}`
      : ""
    places.push(count(usage.tasks, "task") + across)
  }
  if (usage.others) places.push(count(usage.others, "other record"))
  const where = places.length
    ? `It’s on ${places.join(", plus ")}, and comes off all of them.`
    : "It isn’t on anything yet."
  return `${where} This can’t be undone.`
}
