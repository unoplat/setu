import { createFileRoute, Outlet } from "@tanstack/react-router"

// Layout for a single Project: its sections (Tasks, Settings, ...) are child
// routes, and the sidebar lists them under the project (Paper: "Projects and
// Project Sections"), so nothing here besides the outlet.
export const Route = createFileRoute("/_authenticated/_shell/projects/$name")({
  component: Outlet,
})
