import { Link, useParams } from "@tanstack/react-router"

import type { Module } from "@/lib/modules"

/**
 * The name opens the module (Paper: 07d — Module Detail, "row clicked"). It
 * is a real link rather than a click handler on the row, so ⌘-click,
 * middle-click and the keyboard work as they do for any link; its `::after`
 * stretches over the row, which the table marks `relative`, so a click
 * anywhere on the row lands on it.
 */
export function ModuleLink({ module }: { module: Module }) {
  const { name } = useParams({ from: "/_authenticated/_shell/projects/$name" })
  return (
    <Link
      to="/projects/$name/modules/$module"
      params={{ name, module: module.name }}
      className="font-medium outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
    >
      {module.module_name}
    </Link>
  )
}
