import { Link, useParams } from "@tanstack/react-router"

import type { Milestone } from "@/lib/milestones"

/**
 * The title opens the milestone (Paper: 06d — Milestone Detail, "row
 * clicked"). It is a real link rather than a click handler on the row, so
 * ⌘-click, middle-click and the keyboard work as they do for any link; its
 * `::after` stretches over the row, which the table marks `relative`, so a
 * click anywhere on the row lands on it.
 * https://tanstack.com/router/latest/docs/framework/react/guide/navigation
 */
export function MilestoneLink({ milestone }: { milestone: Milestone }) {
  const { name } = useParams({ from: "/_authenticated/_shell/projects/$name" })
  return (
    <Link
      to="/projects/$name/milestones/$milestone"
      params={{ name, milestone: milestone.name }}
      className="font-medium outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
    >
      {milestone.subject}
    </Link>
  )
}
