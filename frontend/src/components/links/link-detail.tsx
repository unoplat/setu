import * as React from "react"
import { format, formatDistanceToNowStrict } from "date-fns"
import { ArrowUpRightIcon, CopyIcon, LinkIcon } from "lucide-react"

import {
  PersonValue,
  ProjectProperty,
  Property,
  ReadOnlyDescription,
} from "@/components/detail-properties"
import {
  RecordActivityLog,
  RecordComments,
  type ActivitySource,
} from "@/components/record-activity"
import { DetailLayout, KindRow, RailGroup } from "@/components/record-detail"
import { buttonVariants } from "@/components/ui/button"
import {
  copyAddress,
  displayHost,
  hostOf,
  linkActivityKey,
  type LinkDetail,
} from "@/lib/links"
import { cn } from "@/lib/utils"

import { LinkTypeIcon } from "./link-type-picker"

// Paper: Links 04a — Link detail (card clicked). The name, the address and the
// description in the content column; the properties and the activity in the
// rail, as on the module page (07d).

const LINK_ACTIVITY: ActivitySource = {
  doctype: "Envision Link",
  method: "setu.api.link.get_link_activity",
  commentMethod: "setu.api.link.add_link_comment",
  key: linkActivityKey,
  commentScope: "link-comment",
  commentCommand: "link.comment",
  createdLabel: "this link",
}

/** What follows the description in the content column: the comments. */
export function LinkSections({ link }: { link: LinkDetail }) {
  return <RecordComments record={link.name} source={LINK_ACTIVITY} />
}

/** 04a's Activity, closing the rail. */
export function LinkActivityLog({ link }: { link: LinkDetail }) {
  return <RecordActivityLog record={link.name} source={LINK_ACTIVITY} />
}

/** 04a's chip above the name: the type, then the host. */
export function LinkKind({
  link,
  url,
}: {
  link: LinkDetail
  /** The address being edited, so the host follows it. */
  url?: string
}) {
  // The saved host while the address is mid-edit and not yet an address.
  const host = (url !== undefined && hostOf(url)) || link.host
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-5.5 shrink-0 items-center gap-1 rounded-sm border px-2 text-xs font-medium">
        <LinkTypeIcon
          icon={link.link_type?.icon}
          className="size-3 text-sidebar-primary"
        />
        {link.link_type?.type_name ?? "No type"}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {displayHost(host)}
      </span>
    </div>
  )
}

/** "Sep 12, 2026", and how long ago underneath. */
export function AddedProperty({ creation }: { creation: string }) {
  const date = new Date(creation)
  const valid = !Number.isNaN(date.getTime())
  return (
    <div className="flex items-start py-1.5">
      <dt className="w-24 shrink-0 text-[13px]/6 text-muted-foreground">
        Added
      </dt>
      <dd className="flex min-w-0 flex-col px-2 text-sm/6">
        {valid ? (
          <>
            <time dateTime={creation}>{format(date, "MMM d, yyyy")}</time>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNowStrict(date, { addSuffix: true })}
            </span>
          </>
        ) : (
          "—"
        )}
      </dd>
    </div>
  )
}

/**
 * 04a's Address: the URL with Copy, and the button that opens it in a new
 * tab. `field` replaces the plain URL with its editor on an editable page.
 */
export function AddressBlock({
  linkName,
  url,
  field,
  error,
}: {
  linkName: string
  /** The address Open and Copy use. */
  url: string
  field?: React.ReactNode
  error?: React.ReactNode
}) {
  return (
    <section
      aria-labelledby="link-address-label"
      className="flex flex-col gap-2"
    >
      <h2 id="link-address-label" className="text-sm font-semibold">
        Address
      </h2>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="flex h-11 min-w-0 grow items-center gap-2 rounded-xl border bg-card ps-3 pe-1.5">
          <LinkIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          {field ?? (
            <span className="min-w-0 grow truncate text-sm" title={url}>
              {url}
            </span>
          )}
          <button
            type="button"
            onClick={() => void copyAddress(url)}
            className={cn(
              buttonVariants({ variant: "secondary", size: "xs" }),
              "h-7 shrink-0 rounded-lg px-2"
            )}
          >
            <CopyIcon />
            Copy
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-11 max-w-full shrink-0 px-4.5 font-semibold"
          )}
        >
          <span className="max-w-60 truncate">Open {linkName}</span>
          <ArrowUpRightIcon data-icon="inline-end" />
        </a>
      </div>
      {error}
      <p className="text-xs text-muted-foreground">
        Opens in a new tab. Envision doesn’t load or preview this page.
      </p>
    </section>
  )
}

/** 04a for someone who may read the link but not edit it. */
export function LinkReadOnly({
  link,
  projectName,
  footer,
  activity,
}: {
  link: LinkDetail
  projectName: string
  footer: React.ReactNode
  activity: React.ReactNode
}) {
  return (
    <DetailLayout
      rail={
        <>
          <RailGroup label="Properties">
            <dl className="flex flex-col">
              <Property label="Type" plain>
                <LinkTypeIcon
                  icon={link.link_type?.icon}
                  className="size-3.5 text-muted-foreground"
                />
                <span className="truncate">
                  {link.link_type?.type_name ?? "No type"}
                </span>
              </Property>
              <Property label="Added by" plain>
                <PersonValue person={link.added_by} emptyLabel="Unknown" />
              </Property>
              <AddedProperty creation={link.creation} />
              <ProjectProperty projectName={projectName} />
            </dl>
          </RailGroup>
          {activity}
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <KindRow>
            <LinkKind link={link} />
          </KindRow>
          <h1 className="text-3xl/9 font-semibold tracking-tight">
            {link.link_name}
          </h1>
        </div>
        <AddressBlock linkName={link.link_name} url={link.url} />
        <ReadOnlyDescription value={link.description} />
      </div>
      {footer}
    </DetailLayout>
  )
}
