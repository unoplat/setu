import * as React from "react"
import { useSelector } from "@tanstack/react-form"

import { PersonValue, Property } from "@/components/detail-properties"
import { ProjectCombobox } from "@/components/project-combobox"
import {
  DescriptionField,
  DetailLayout,
  KindRow,
  RailGroup,
  TitleInput,
} from "@/components/record-detail"
import { FieldError } from "@/components/ui/field"
import type {
  AutosaveListeners,
  AutosaveStatus,
  ConflictChoice,
} from "@/lib/autosave"
import { isWebAddress, normalizeUrl, type LinkDetail } from "@/lib/links"

import {
  createLinkFormOptions,
  validateLinkName,
  validateUrl,
  visibleError,
  withForm,
} from "./form"
import { AddedProperty, AddressBlock, LinkKind } from "./link-detail"
import { LinkTypeProperty } from "./link-type-picker"

// Paper: Links 04a — Link detail, editable. Every property can be changed:
// the name, the address and the description on the page, the type and the
// project in the rail. There is no Save: as on the module page (07d), each
// field's `listeners` send its edit (lib/autosave), a picker at once and
// typing after a pause.

export const LinkForm = withForm({
  ...createLinkFormOptions,
  props: {
    link: {} as LinkDetail,
    projectName: "",
    listeners: {} as AutosaveListeners,
    status: "idle" as AutosaveStatus,
    /** Moves when the description was replaced from outside. */
    descriptionRevision: 0,
    /** Set while the description was changed elsewhere as it was written. */
    descriptionConflict: null as ((choice: ConflictChoice) => void) | null,
    /** How the edits are doing, shown beside the link's chip. */
    indicator: null as React.ReactNode,
    expanded: false,
    onExpand: () => {},
    onCollapse: () => {},
    /** Enter in the name or the address: save now. */
    onSubmit: () => {},
    /** What follows the description: the comments. */
    footer: null as React.ReactNode,
    /** What closes the rail: the activity log. */
    activity: null as React.ReactNode,
  },
  render: function LinkFormView({
    form,
    link,
    projectName,
    listeners,
    status,
    descriptionRevision,
    descriptionConflict,
    indicator,
    expanded,
    onExpand,
    onCollapse,
    onSubmit,
    footer,
    activity,
  }) {
    const url = useSelector(form.store, (state) => state.values.url)
    const linkName = useSelector(form.store, (state) => state.values.link_name)
    // Open and Copy follow the address being typed once it is an address.
    const openUrl = isWebAddress(url) ? normalizeUrl(url) : link.url

    return (
      <DetailLayout
        rail={
          <>
            <RailGroup label="Properties">
              <dl className="flex flex-col">
                <Property label="Type" htmlFor="link-type">
                  <form.Field name="link_type" listeners={listeners.picked}>
                    {(field) => (
                      <LinkTypeProperty
                        id="link-type"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        current={link}
                      />
                    )}
                  </form.Field>
                </Property>
                <Property label="Added by" plain>
                  <PersonValue person={link.added_by} emptyLabel="Unknown" />
                </Property>
                <AddedProperty creation={link.creation} />
                <Property label="Project" htmlFor="link-project">
                  <form.Field name="project" listeners={listeners.picked}>
                    {(field) => (
                      <ProjectCombobox
                        id="link-project"
                        variant="inline"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        current={{
                          name: link.project,
                          project_name: link.project_name ?? projectName,
                        }}
                      />
                    )}
                  </form.Field>
                </Property>
              </dl>
            </RailGroup>

            {activity}
          </>
        }
      >
        <form
          noValidate
          aria-label="Link"
          className="flex flex-col gap-8"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            // Some of the editor package's controls are plain <button>s, which
            // default to type="submit" inside a form.
            const { submitter } = event.nativeEvent as SubmitEvent
            if (submitter?.closest(".envision-rte")) return
            onSubmit()
          }}
        >
          <div className="flex flex-col gap-3">
            <KindRow indicator={indicator}>
              <LinkKind link={link} url={url} />
            </KindRow>
            <form.Field
              name="link_name"
              listeners={listeners.typed}
              validators={{
                onChange: ({ value }) => validateLinkName(value),
              }}
            >
              {(field) => (
                <TitleInput
                  id="link-title"
                  name="link_name"
                  label="Link name"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  error={visibleError(field.state.meta)}
                />
              )}
            </form.Field>
          </div>

          <form.Field
            name="url"
            listeners={listeners.typed}
            validators={{ onChange: ({ value }) => validateUrl(value) }}
          >
            {(field) => {
              const fieldError = visibleError(field.state.meta)
              return (
                <AddressBlock
                  linkName={linkName.trim() || link.link_name}
                  url={openUrl}
                  field={
                    <input
                      id="link-url"
                      name="url"
                      type="url"
                      inputMode="url"
                      aria-labelledby="link-address-label"
                      autoComplete="off"
                      spellCheck={false}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={() => {
                        const next = normalizeUrl(field.state.value)
                        if (next !== field.state.value) field.handleChange(next)
                        field.handleBlur()
                      }}
                      aria-invalid={fieldError ? true : undefined}
                      className="h-full min-w-0 grow bg-transparent text-sm outline-none aria-invalid:text-destructive"
                    />
                  }
                  error={
                    fieldError ? <FieldError>{fieldError}</FieldError> : null
                  }
                />
              )
            }}
          </form.Field>

          <form.Field name="description" listeners={listeners.typed}>
            {(field) => (
              <DescriptionField
                value={field.state.value}
                revision={descriptionRevision}
                conflict={descriptionConflict}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                expanded={expanded}
                onExpand={onExpand}
                onCollapse={onCollapse}
                label="Link description"
                subtitle={`${link.link_name} · Link`}
                toggleCommand="link.toggleDescription"
                collapseCommand="link.collapseDescription"
                status={status}
              />
            )}
          </form.Field>
        </form>
        {footer}
      </DetailLayout>
    )
  },
})
