import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, PlusIcon } from "lucide-react"

import { IconTile } from "@/components/reui/icon-tile"
import { buttonVariants } from "@/components/ui/button"
import { displayHost, type LinkSummary } from "@/lib/links"
import { cn } from "@/lib/utils"

import { LinkActions } from "./link-actions"
import { LinkTypeIcon } from "./link-type-picker"

// Paper: Links 03 — Link added, 04 — Doors, open in new tab, 05 — Door
// actions menu. A door is one card: its type's icon, the name, two lines of
// description, and the type and host underneath. Nothing is fetched from the
// address: no favicon, no preview.

const cardClassName =
  "relative flex min-h-50 flex-col rounded-2xl border bg-card p-5 text-card-foreground transition-shadow"

/**
 * The name is the card's one link into Envision, and its `::after` covers the
 * card, so a click anywhere on it opens the link's page while ⌘-click and the
 * keyboard work as on any link. The ⋯ menu and ↗ sit above that layer
 * (`relative z-10`), so nothing interactive is nested in anything else.
 */
export function LinkCard({
  project,
  projectName,
  link,
  isNew = false,
}: {
  project: string
  projectName: string
  link: LinkSummary
  /** Added during this visit (Paper 03): ringed until the page is left. */
  isNew?: boolean
}) {
  const host = displayHost(link.host)
  return (
    <article
      className={cn(
        cardClassName,
        "group/door hover:ring-2 hover:ring-ring/30 has-data-popup-open:ring-2 has-data-popup-open:ring-ring/30 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
        isNew && "ring-2 ring-primary/70 hover:ring-primary/70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <IconTile variant="soft" className="text-sidebar-primary">
          <LinkTypeIcon icon={link.link_type?.icon} />
        </IconTile>
        <div className="relative z-10 -me-1.5 -mt-1 flex items-center gap-0.5">
          <LinkActions
            project={project}
            projectName={projectName}
            link={link}
            variant="card"
            className="text-muted-foreground opacity-0 group-hover/door:opacity-100 group-has-[:focus-visible]/door:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
          />
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${link.link_name} in a new tab`}
            title={`Open ${host || "it"} in a new tab`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "size-7 text-muted-foreground group-hover/door:text-foreground"
            )}
          >
            <ArrowUpRightIcon />
          </a>
        </div>
      </div>

      <h3 className="mt-4 text-base/6 font-semibold tracking-tight">
        <Link
          to="/projects/$name/links/$link"
          params={{ name: project, link: link.name }}
          className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-2xl"
        >
          {link.link_name}
        </Link>
      </h3>
      {link.summary ? (
        <p className="mt-1 line-clamp-2 text-sm/5 text-muted-foreground">
          {link.summary}
        </p>
      ) : null}

      <div className="mt-auto flex min-w-0 items-center gap-2 border-t pt-3 text-xs">
        <span className="shrink-0 font-medium">
          {link.link_type?.type_name ?? "No type"}
        </span>
        <span className="truncate text-muted-foreground">{host}</span>
      </div>
    </article>
  )
}

/** The dashed door that ends the grid (Paper 03, 04). */
export function AddLinkCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        cardClassName,
        "items-center justify-center gap-1.5 border-dashed bg-transparent text-center outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
      )}
    >
      <PlusIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium">Add a link</span>
      <span className="text-xs text-muted-foreground">
        Docs, videos, dashboards, chat…
      </span>
    </button>
  )
}
