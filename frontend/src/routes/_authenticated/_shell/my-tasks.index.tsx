import { createFileRoute } from "@tanstack/react-router"

import { MyTasksBoard } from "@/components/tasks/my-tasks-board"

// All my tasks: the Board of every Task assigned to the signed-in user
// (components/tasks/my-tasks-board.tsx).
export const Route = createFileRoute("/_authenticated/_shell/my-tasks/")({
  component: MyTasksPage,
})

function MyTasksPage() {
  return <MyTasksBoard />
}
