import * as React from "react"
import { useSelector } from "@tanstack/react-form"
import { CheckIcon, Maximize2Icon, Minimize2Icon } from "lucide-react"

import { HotkeyText } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  displayHost,
  guessLinkType,
  hostOf,
  normalizeUrl,
  useLinkTypes,
  type LinkType,
} from "@/lib/links"
import { cn } from "@/lib/utils"

import {
  createLinkFormOptions,
  createState,
  submitOnce,
  validateLinkName,
  validateUrl,
  visibleError,
  withForm,
} from "./form"
import { LinkTypeChips, NewTypePanel } from "./link-type-picker"

// Loaded lazily because the editor is the largest dependency in the app.
const DescriptionEditor = React.lazy(
  () => import("@/components/create-project/description-editor")
)

// Paper: Links 02 — Add a link, 02a — Create a custom type, 02b — Custom type
// selected. The type starts on what the address suggests ("Guessed from
// loom.com") until a chip is picked. As on Create Module, the description is
// the rich text editor, and expanding it swaps the chrome around it and hides
// the other fields, which stay mounted, so the draft carries over.

/**
 * The type a draft will be saved with: the one picked, or else the guess from
 * its address.
 */
export function effectiveLinkType(
  picked: string,
  url: string,
  types: readonly LinkType[] | undefined
): string {
  if (picked) return picked
  return guessLinkType(hostOf(url), types ?? [])?.name ?? ""
}

export const CreateLinkForm = withForm({
  ...createLinkFormOptions,
  props: {
    projectName: "",
    error: null as string | null,
    /** Whether the New type panel is open; Escape closes it first. */
    creatingType: false,
    onCreatingTypeChange: (() => {}) as (open: boolean) => void,
    expanded: false,
    onExpand: () => {},
    onCollapse: () => {},
  },
  render: function CreateLinkFormView({
    form,
    projectName,
    error,
    creatingType,
    onCreatingTypeChange,
    expanded,
    onExpand,
    onCollapse,
  }) {
    const url = useSelector(form.store, (state) => state.values.url)
    const linkName = useSelector(form.store, (state) => state.values.link_name)
    const picked = useSelector(form.store, (state) => state.values.link_type)
    const submitting = useSelector(form.store, (state) => state.isSubmitting)
    const types = useLinkTypes()
    const typeList = types.data?.message
    const linkType = effectiveLinkType(picked, url, typeList)
    const state = createState({ url, linkName, linkType, submitting })
    // "Runbook created", once a new type is picked for this draft.
    const [typeNote, setTypeNote] = React.useState<string | null>(null)

    const host = hostOf(url)
    const guessed = guessLinkType(host, typeList ?? [])
    const typeHint =
      typeNote ??
      (!picked && host && guessed
        ? guessed.type_name.toLocaleLowerCase() === "link"
          ? `No match for ${displayHost(host)}`
          : `Guessed from ${displayHost(host)}`
        : null)

    return (
      <form
        noValidate
        className={
          expanded ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-6"
        }
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          // Some of the editor package's controls are plain <button>s, which
          // default to type="submit" inside a form.
          const { submitter } = event.nativeEvent as SubmitEvent
          if (submitter?.closest(".envision-rte")) return
          void submitOnce(form)
        }}
      >
        {expanded ? (
          <header className="flex shrink-0 items-center justify-between gap-4 border-b px-8 py-6">
            <div className="flex flex-col gap-1.5">
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                Link description
              </DialogTitle>
              <DialogDescription>
                {linkName.trim() || "Untitled link"} · Add link
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9.5 gap-2 rounded-full px-3"
              onClick={onCollapse}
            >
              <Minimize2Icon />
              Collapse
              <HotkeyText
                command="createLink.toggleDescription"
                className="text-xs font-normal text-muted-foreground"
              />
            </Button>
          </header>
        ) : (
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Add link
            </DialogTitle>
            <DialogDescription>
              Everyone on {projectName} sees it under Links.
            </DialogDescription>
          </div>
        )}

        <FieldGroup className={expanded ? "min-h-0 flex-1 gap-0" : "gap-4"}>
          <form.Field
            name="url"
            validators={{ onChange: ({ value }) => validateUrl(value) }}
          >
            {(field) => {
              const fieldError = visibleError(field.state.meta)
              return (
                <Field
                  className={cn("gap-2", expanded && "hidden")}
                  data-invalid={fieldError ? true : undefined}
                >
                  <FieldLabel htmlFor="link-url">Web address</FieldLabel>
                  <Input
                    id="link-url"
                    name="url"
                    type="url"
                    inputMode="url"
                    placeholder="https://docs.example.com"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus={!expanded}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={() => {
                      // "loom.com/share/x" reads as https://loom.com/share/x.
                      const next = normalizeUrl(field.state.value)
                      if (next !== field.state.value) field.handleChange(next)
                      field.handleBlur()
                    }}
                    aria-invalid={fieldError ? true : undefined}
                    className="h-10 rounded-xl"
                  />
                  <FieldError>{fieldError}</FieldError>
                </Field>
              )
            }}
          </form.Field>

          <form.Field
            name="link_name"
            validators={{ onChange: ({ value }) => validateLinkName(value) }}
          >
            {(field) => {
              const fieldError = visibleError(field.state.meta)
              return (
                <Field
                  className={cn("gap-2", expanded && "hidden")}
                  data-invalid={fieldError ? true : undefined}
                >
                  <FieldLabel htmlFor="link-name">Name</FieldLabel>
                  <Input
                    id="link-name"
                    name="link_name"
                    placeholder="Onboarding walkthrough"
                    autoComplete="off"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={fieldError ? true : undefined}
                    className="h-10 rounded-xl"
                  />
                  <FieldError>{fieldError}</FieldError>
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <Field className={expanded ? "min-h-0 flex-1 gap-0" : "gap-2"}>
                {expanded ? null : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FieldLabel id="link-description-label">
                        Description
                      </FieldLabel>
                      <span className="text-xs text-muted-foreground">
                        Optional
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-7 gap-1.5 rounded-md px-2"
                      disabled={submitting}
                      onClick={onExpand}
                    >
                      <Maximize2Icon className="size-3.5" />
                      Expand
                      <HotkeyText
                        command="createLink.toggleDescription"
                        className="font-normal text-muted-foreground"
                      />
                    </Button>
                  </div>
                )}
                <React.Suspense
                  fallback={
                    expanded ? (
                      <div className="flex min-h-0 flex-1 flex-col gap-4 px-12 py-10">
                        <Skeleton className="h-8 w-1/3" />
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-5 w-1/2" />
                      </div>
                    ) : (
                      <Skeleton className="h-37 rounded-xl" />
                    )
                  }
                >
                  <DescriptionEditor
                    value={field.state.value}
                    onChange={(html) => field.handleChange(html)}
                    onBlur={field.handleBlur}
                    expanded={expanded}
                    label="Link description"
                  />
                </React.Suspense>
              </Field>
            )}
          </form.Field>

          <form.Field name="link_type">
            {(field) => (
              <Field className={cn("gap-2", expanded && "hidden")}>
                <div className="flex items-center justify-between gap-4">
                  <FieldLabel htmlFor="link-type">Type</FieldLabel>
                  {typeHint ? (
                    <span
                      className="truncate text-xs text-muted-foreground"
                      aria-live="polite"
                    >
                      {typeHint}
                    </span>
                  ) : null}
                </div>
                <LinkTypeChips
                  id="link-type"
                  types={typeList}
                  loading={types.isLoading}
                  value={linkType}
                  onChange={(name) => {
                    setTypeNote(null)
                    field.handleChange(name)
                  }}
                  creating={creatingType}
                  onNewType={() => onCreatingTypeChange(!creatingType)}
                  disabled={submitting}
                />
                {creatingType ? (
                  <NewTypePanel
                    onCancel={() => onCreatingTypeChange(false)}
                    onCreated={(type) => {
                      field.handleChange(type.name)
                      setTypeNote(`${type.type_name} created`)
                      onCreatingTypeChange(false)
                    }}
                  />
                ) : null}
                {types.error ? (
                  <FieldError>Types could not be loaded.</FieldError>
                ) : null}
              </Field>
            )}
          </form.Field>

          {error && !expanded ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>

        {expanded ? (
          <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-8 py-5">
            <div className="flex flex-col gap-1">
              <span className="text-sm">Changes stay in your link draft</span>
              <span className="text-xs text-muted-foreground">
                <HotkeyText command="createLink.collapseDescription" /> to
                return to the form · Your link isn’t added yet
              </span>
            </div>
            <Button
              type="button"
              size="lg"
              className="gap-3 px-5 font-semibold"
              onClick={onCollapse}
            >
              Done
              <CheckIcon />
            </Button>
          </footer>
        ) : (
          <footer className="flex flex-wrap items-center justify-end gap-2.5">
            <span
              className="me-auto text-xs text-muted-foreground"
              aria-live="polite"
            >
              {state === "ready" ? (
                <>
                  <HotkeyText command="createLink.submit" /> to add
                </>
              ) : state === "creating" ? (
                "Adding the link…"
              ) : null}
            </span>
            <DialogClose
              render={<Button type="button" variant="ghost" size="lg" />}
              disabled={submitting}
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="lg"
              className="px-4.5 font-semibold"
              disabled={state !== "ready" || creatingType}
            >
              {submitting ? "Adding…" : "Add link"}
            </Button>
          </footer>
        )}
      </form>
    )
  },
})
