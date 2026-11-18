import * as React from "react"
import { FlagIcon, LayoutGridIcon, SquareCheckIcon } from "lucide-react"

import { linkIconElement } from "@/lib/links"
import type { ExcerptPart, RecordType, SearchResult } from "@/lib/search"

// What the ⌘K dialog and phone Search draw alike.

const RECORD_ICONS: Record<Exclude<RecordType, "link">, React.ReactNode> = {
  task: <SquareCheckIcon />,
  module: <LayoutGridIcon />,
  milestone: <FlagIcon />,
}

/** A result's kind as an icon; a link wears its type's. */
export function RecordIcon({ result }: { result: SearchResult }) {
  return (
    <>
      {result.type === "link"
        ? linkIconElement(result.icon)
        : RECORD_ICONS[result.type]}
    </>
  )
}

/** Text with its matched parts marked: a description excerpt, or a title. */
export function MatchedText({
  parts,
  className,
  markClassName,
}: {
  parts: ExcerptPart[]
  className?: string
  markClassName?: string
}) {
  if (!parts.length) return null
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.match ? (
          // Parts are positional: the same text can match twice.
          <mark key={index} className={markClassName}>
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        )
      )}
    </span>
  )
}
