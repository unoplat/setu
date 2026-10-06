import { formOptions } from "@tanstack/react-form"

import { isWebAddress, normalizeUrl, type LinkDetail } from "@/lib/links"

export { submitOnce, useAppForm, withForm } from "@/lib/form"
export { visibleError } from "@/components/milestones/form"

/**
 * A link's editable fields, as the Add link dialog (Paper: Links 02) and the
 * link page (04a) both keep them.
 */

export interface LinkValues {
  url: string
  link_name: string
  /** The rich text editor's HTML, or "" when nothing was written. */
  description: string
  /**
   * The Envision Link Type's name (its id). In the Add link dialog "" means
   * "whatever the address suggests" (see lib/links guessLinkType).
   */
  link_type: string
  /** The Project's name (its id); a link always has one. */
  project: string
}

export const EMPTY_LINK: LinkValues = {
  url: "",
  link_name: "",
  description: "",
  link_type: "",
  project: "",
}

export const createLinkFormOptions = formOptions({
  defaultValues: EMPTY_LINK,
})

// Declared `string | undefined` rather than inferred, so a server message can
// later be written into the same error map without a type clash.
export function validateLinkName(value: string): string | undefined {
  return value.trim() ? undefined : "Give the link a name."
}

/**
 * Only web addresses: the server refuses anything but http and https too. A
 * missing scheme is fine, since `https://` is added (lib/links normalizeUrl).
 */
export function validateUrl(value: string): string | undefined {
  if (!value.trim()) return "Paste the web address."
  return isWebAddress(value)
    ? undefined
    : "Use a web address, like https://docs.example.com."
}

export function validateTypeName(value: string): string | undefined {
  return value.trim() ? undefined : "Name the type."
}

/** Whether Add is on, and what the footer says while it is off. */
export type CreateState = "creating" | "incomplete" | "ready"

export function createState(input: {
  url: string
  linkName: string
  linkType: string
  submitting: boolean
}): CreateState {
  if (input.submitting) return "creating"
  return isWebAddress(input.url) && input.linkName.trim() && input.linkType
    ? "ready"
    : "incomplete"
}

/**
 * Closing with an address, a name or a description asks first, as the Create
 * Module panel does; a type alone is one click to redo. The editor reports an
 * emptied document as "", so typing and then deleting everything is not a
 * draft either.
 */
export function hasDraft(values: LinkValues): boolean {
  return (
    values.url.trim() !== "" ||
    values.link_name.trim() !== "" ||
    values.description.trim() !== ""
  )
}

/** A saved link as the form holds it. */
export function linkValues(link: LinkDetail): LinkValues {
  return {
    url: link.url,
    link_name: link.link_name,
    description: link.description,
    link_type: link.link_type?.name ?? "",
    project: link.project,
  }
}

/**
 * A link's values as they are saved and compared: the name trimmed and the
 * address normalized. The description is the editor's HTML, kept as it is.
 */
export function prepareLink(values: LinkValues): LinkValues {
  return {
    ...values,
    url: normalizeUrl(values.url),
    link_name: values.link_name.trim(),
  }
}
