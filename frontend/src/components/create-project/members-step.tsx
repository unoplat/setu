import * as React from "react"
import { SearchIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { useInvitableUsers, type InvitableUser } from "@/lib/projects"
import { cn } from "@/lib/utils"

import { createProjectFormOptions, withForm } from "./form"
import { MemberListSkeleton } from "./member-list-skeleton"
import { StepSubmitHotkey } from "./step-submit-hotkey"

// Paper: "Invite Members Dialog" (02 — Invite Project Members), step 2 of 2.
// Only the creator has access by default; everyone picked here is appended to
// ERPNext's Project User table by setu.api.project.create_project.

function initials(user: InvitableUser) {
  return (user.full_name || user.name)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function matches(user: InvitableUser, query: string) {
  if (!query) return true
  const haystack = `${user.full_name} ${user.name}`.toLowerCase()
  return haystack.includes(query)
}

export const MembersStep = withForm({
  ...createProjectFormOptions,
  props: {
    projectName: "",
    submitting: false,
    error: null as string | null,
    onSkip: () => {},
  },
  render: function MembersStepForm({
    form,
    projectName,
    submitting,
    error,
    onSkip,
  }) {
    const [search, setSearch] = React.useState("")
    const { data, isLoading } = useInvitableUsers()
    const query = search.trim().toLowerCase()
    const users = (data?.message ?? []).filter((user) => matches(user, query))

    return (
      <form.FormGroup
        name="members"
        onGroupSubmit={() => void form.handleSubmit()}
      >
        {(group) => (
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void group.handleSubmit()
            }}
          >
            <StepSubmitHotkey onSubmit={() => void group.handleSubmit()} />

            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="gap-2">
                <DialogTitle className="text-2xl font-semibold tracking-tight">
                  Invite project members
                </DialogTitle>
                <DialogDescription>
                  Add people to {projectName || "the project"} now, or skip and
                  invite them later.
                </DialogDescription>
              </DialogHeader>
              <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-muted px-2.5 text-[11px] font-medium text-muted-foreground">
                Step 2 of 2
              </span>
            </div>

            <Field className="mt-7 gap-2">
              <FieldLabel htmlFor="member-search">
                Find workspace members
              </FieldLabel>
              <InputGroup className="h-11 rounded-xl border-border bg-background">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="member-search"
                  placeholder="Search by name or email"
                  autoComplete="off"
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </InputGroup>
            </Field>

            <form.Field name="members.users">
              {(field) => {
                const selected = new Set(field.state.value)
                function toggle(user: string, checked: boolean) {
                  const next = new Set(field.state.value)
                  if (checked) next.add(user)
                  else next.delete(user)
                  field.handleChange([...next])
                }
                return (
                  <div className="mt-4.5 max-h-64 overflow-y-auto rounded-xl border">
                    {isLoading ? (
                      <MemberListSkeleton />
                    ) : users.length === 0 ? (
                      <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
                        {query
                          ? "No one matches that search."
                          : "No other workspace members yet."}
                      </p>
                    ) : (
                      users.map((user) => {
                        const checked = selected.has(user.name)
                        return (
                          <label
                            key={user.name}
                            data-selected={checked ? "" : undefined}
                            className={cn(
                              "flex h-16 cursor-pointer items-center gap-3 border-t px-3.5 first:border-t-0",
                              "hover:bg-muted/50 data-selected:bg-muted"
                            )}
                          >
                            <Avatar className="size-9">
                              {user.user_image ? (
                                <AvatarImage src={user.user_image} alt="" />
                              ) : null}
                              <AvatarFallback
                                className={cn(
                                  "text-[11px] font-semibold",
                                  checked &&
                                    "bg-sidebar-primary text-sidebar-primary-foreground"
                                )}
                              >
                                {initials(user)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="grid min-w-0 flex-1 leading-tight">
                              <span className="truncate text-sm font-medium">
                                {user.full_name || user.name}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {user.name}
                              </span>
                            </span>
                            <Checkbox
                              className="size-5 rounded-sm"
                              checked={checked}
                              onCheckedChange={(value) =>
                                toggle(user.name, value === true)
                              }
                              aria-label={`Invite ${user.full_name || user.name}`}
                            />
                          </label>
                        )
                      })
                    )}
                  </div>
                )
              }}
            </form.Field>

            {error ? <FieldError className="mt-3">{error}</FieldError> : null}

            <div className="mt-6 flex items-center justify-between gap-4">
              <form.Subscribe
                selector={(state) => state.values.members.users.length}
              >
                {(count) => (
                  <span className="text-xs font-medium text-muted-foreground">
                    {count === 1
                      ? "1 member selected"
                      : `${count} members selected`}
                  </span>
                )}
              </form.Subscribe>
              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  disabled={submitting}
                  onClick={onSkip}
                >
                  Skip for now
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="px-4.5 font-semibold"
                  disabled={submitting}
                >
                  Invite and create
                </Button>
              </div>
            </div>
          </form>
        )}
      </form.FormGroup>
    )
  },
})
