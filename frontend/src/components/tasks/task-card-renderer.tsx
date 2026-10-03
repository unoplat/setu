import type { KanbanCardRenderer } from "@/components/kanban-board"
import { TASK_CARD_RENDERER_ID, type TaskCardData } from "@/lib/tasks"

import { TaskCard } from "./task-card"

/** The Board's renderer for Task Cards; Cards are not edited in place. */
export const taskCardRenderer: KanbanCardRenderer<TaskCardData> = {
  id: TASK_CARD_RENDERER_ID,
  label: "Task",
  render: (data, ctx) => <TaskCard data={data} isDragging={ctx.isDragging} />,
}
