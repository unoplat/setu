import { createFileRoute, Outlet } from "@tanstack/react-router"

// Layout for My tasks, the global, cross-Project view of the Tasks assigned to
// the signed-in user: All my tasks is its index and each of its Custom Views a
// child route, as a Project's are (projects.$name.tsx).
export const Route = createFileRoute("/_authenticated/_shell/my-tasks")({
  component: Outlet,
})
