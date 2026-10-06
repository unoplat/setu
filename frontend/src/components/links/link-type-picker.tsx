import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { useSWRConfig } from "frappe-react-sdk"
import { ChevronDownIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  ICON_KEYS,
  ICON_LABELS,
  LINK_ICONS,
  LINK_TYPES_KEY,
  linkIconElement,
  useCreateLinkType,
  useLinkTypes,
  type IconKey,
  type LinkType,
} from "@/lib/links"
import { propertyTriggerClassName } from "@/lib/style"
import { cn } from "@/lib/utils"

import { submitOnce, useAppForm, validateTypeName, visibleError } from "./form"

// Paper: Links 02 (the Type chips), 02a (+ New type opens an inline panel)
// and 02b (the new type is created and selected). The same pieces serve the
// Add link dialog and the Type property on the link page.

/** A type's lucide icon, drawn from its icon key. */
export function LinkTypeIcon({
  icon,
  className,
}: {
  icon: string | null | undefined
  className?: string
}) {
  return linkIconElement(icon, { className })
}

const chipClassName =
  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3"

/**
 * One chip per type, the chosen one pressed, then "+ New type". Every type is
 * a toggle button in one group, so the group reads as a single choice.
 */
export function LinkTypeChips({
  id,
  types,
  loading,
  value,
  onChange,
  creating,
  onNewType,
  disabled = false,
}: {
  id?: string
  types: readonly LinkType[] | undefined
  loading: boolean
  /** The chosen type's name (its id). */
  value: string
  onChange: (name: string) => void
  /** Whether the New type panel is open under the chips. */
  creating: boolean
  onNewType: () => void
  disabled?: boolean
}) {
  if (loading && !types) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-18 rounded-full" />
        ))}
      </div>
    )
  }
  return (
    <div
      id={id}
      role="group"
      aria-label="Type"
      className="flex flex-wrap gap-1.5"
    >
      {(types ?? []).map((type) => {
        const selected = type.name === value
        return (
          <button
            key={type.name}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(type.name)}
            className={cn(
              chipClassName,
              selected
                ? "border-primary bg-primary/12 text-foreground ring-1 ring-primary/40"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {/* Built-ins read by name alone; a custom type shows its icon. */}
            {type.is_standard && !selected ? null : (
              <LinkTypeIcon icon={type.icon} />
            )}
            {type.type_name}
          </button>
        )
      })}
      <button
        type="button"
        aria-expanded={creating}
        disabled={disabled}
        onClick={onNewType}
        className={cn(
          chipClassName,
          creating
            ? "border-primary bg-primary/12 text-foreground"
            : "border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <PlusIcon />
        New type
      </button>
    </div>
  )
}

/**
 * Paper 02a: a name and an icon for a type every project can use. It is not a
 * <form>, since it sits inside the link's own form: Enter in the name creates
 * the type instead of submitting the link.
 */
export function NewTypePanel({
  onCreated,
  onCancel,
  className,
}: {
  onCreated: (type: LinkType) => void
  onCancel: () => void
  className?: string
}) {
  const { mutate } = useSWRConfig()
  const { call, error, reset } = useCreateLinkType()
  const nameId = React.useId()

  const form = useAppForm({
    defaultValues: { type_name: "", icon: "clipboard-list" as IconKey },
    onSubmit: async ({ value }) => {
      const response = await call({
        type_name: value.type_name.trim(),
        icon: value.icon,
      }).catch(() => null)
      if (!response) return
      const created = response.message
      // Shown at once, then confirmed by the server's own order.
      void mutate(
        LINK_TYPES_KEY,
        (current?: { message: LinkType[] }) => ({
          message: [
            ...(current?.message ?? []).filter(
              (type) => type.name !== created.name
            ),
            created,
          ],
        }),
        { revalidate: true }
      )
      reset()
      onCreated(created)
    },
  })
  const submitting = useSelector(form.store, (state) => state.isSubmitting)

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-muted/30 p-3.5",
        className
      )}
    >
      <form.Field
        name="type_name"
        validators={{ onChange: ({ value }) => validateTypeName(value) }}
      >
        {(field) => {
          const fieldError = visibleError(field.state.meta)
          return (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="text-xs font-medium">
                Type name
              </label>
              <Input
                id={nameId}
                autoFocus
                autoComplete="off"
                placeholder="Runbook"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  event.stopPropagation()
                  void submitOnce(form)
                }}
                aria-invalid={fieldError ? true : undefined}
                className="h-9 rounded-lg"
              />
              <FieldError>{fieldError}</FieldError>
            </div>
          )
        }}
      </form.Field>

      <form.Field name="icon">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" id={`${nameId}-icon`}>
              Icon
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`${nameId}-icon`}
              className="flex flex-wrap gap-1"
            >
              {ICON_KEYS.map((key) => {
                const Icon = LINK_ICONS[key]
                const selected = field.state.value === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={ICON_LABELS[key]}
                    title={ICON_LABELS[key]}
                    onClick={() => field.handleChange(key)}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/30 [&_svg]:size-4",
                      selected
                        ? "border-primary bg-primary/12 text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </form.Field>

      {error ? <FieldError>{frappeErrorMessage(error)}</FieldError> : null}

      <div className="flex items-center gap-2">
        <span className="grow text-xs text-muted-foreground">
          Every project can use it.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={submitting}
          onClick={() => {
            reset()
            onCancel()
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-semibold"
          disabled={submitting}
          onClick={() => void submitOnce(form)}
        >
          {submitting ? "Creating…" : "Create type"}
        </Button>
      </div>
    </div>
  )
}

/**
 * The Type property: the type as a quiet button that opens the same chips as
 * the Add link dialog, with "+ New type" (Paper 02a) inside.
 */
export function LinkTypeProperty({
  id,
  value,
  onChange,
  onBlur,
  current,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  /** The link as saved, whose type shows while the list loads. */
  current: { link_type: LinkType | null }
}) {
  const [open, setOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const types = useLinkTypes()
  const typeList = types.data?.message
  const selected =
    typeList?.find((type) => type.name === value) ??
    (current.link_type?.name === value ? current.link_type : null)

  function choose(name: string) {
    setOpen(false)
    setCreating(false)
    if (name !== value) onChange(name)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setCreating(false)
          onBlur()
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="ghost"
            className={`${propertyTriggerClassName} gap-2 [&>svg:last-child]:size-3`}
          />
        }
      >
        <LinkTypeIcon
          icon={selected?.icon}
          className="size-3.5 text-muted-foreground"
        />
        <span className="wrap-anywhere">
          {selected?.type_name ?? "Choose a type"}
        </span>
        <ChevronDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3">
        <LinkTypeChips
          types={typeList}
          loading={types.isLoading}
          value={value}
          onChange={choose}
          creating={creating}
          onNewType={() => setCreating((now) => !now)}
        />
        {creating ? (
          <NewTypePanel
            onCancel={() => setCreating(false)}
            onCreated={(type) => choose(type.name)}
          />
        ) : null}
        {types.error ? (
          <FieldError>Types could not be loaded.</FieldError>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
