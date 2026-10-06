import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  useFrappePostCall,
  useSWRConfig,
  type FrappeError,
} from "frappe-react-sdk"
import { toast } from "sonner"

import {
  KanbanBoard,
  type KanbanBoardProps,
  type KanbanData,
  type KanbanItem,
} from "@/components/kanban-board"
import { MyTasksHeader } from "@/components/my-tasks-header"
import { TaskDragPreview } from "@/components/tasks/task-card"
import { taskCardRenderer } from "@/components/tasks/task-card-renderer"
import { Skeleton } from "@/components/ui/skeleton"
import { BoardToolbar } from "@/components/views/board-toolbar"
import { OnlyYouBadge } from "@/components/views/only-you-badge"
import type { ProjectChoice } from "@/components/views/task-filter-bar"
import { useAssignees, type Assignee } from "@/lib/assignees"
import { useBoardView, useBoardViewActions } from "@/lib/board-view"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  isMilestoneProgressKey,
  useMilestoneOptions,
  type MilestoneOption,
} from "@/lib/milestones"
import { useProjects } from "@/lib/projects"
import {
  filterTasks,
  MY_TASKS_FIELDS,
  useBoardFilters,
} from "@/lib/task-filters"
import {
  applyTaskMove,
  boardStatus,
  BOARD_COLUMNS,
  BOARD_PALETTE,
  columnCreateStatus,
  MY_TASKS_KEY,
  projectTasksKey,
  taskActivityKey,
  taskKey,
  taskMove,
  toProjectRowsData,
  useMyTasks,
  useTags,
  type MyTask,
  type TaskCardData,
  type TaskDetail,
  type TaskMove,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"
import { useViews, type View } from "@/lib/views"

// My tasks (CONTEXT.md) as a Board, as All my tasks and as one of its own
// Custom Views: the Tasks assigned to this user on every Envision-enabled
// Project, Done ones included.
//
// Paper: My Tasks 05 — Board (v1, simplified). The Project Board's Status
// columns and Cards, with a collapsible row for each Project instead of each
// Module; a Project none of whose Tasks pass the filters folds to its name and
// a count of 0. My tasks has no Project to create in, so neither columns nor
// rows have a "+". A Card opens its Task's page. Dragging a Card to another
// column changes its Status, as on the Project Board (project-board.tsx); a
// Task cannot change Project here, so a drop on another row is ignored and
// the Card goes back.
//
// Paper: My Tasks 06 and 07. Filters, saving and views work as on a Project's
// Board, with Project as a filter and the user's own assignment locked on.
const renderers = [taskCardRenderer]

// Stable empties, so the toolbar's lists keep their identity while loading.
const NO_VIEWS: readonly View[] = []
const NO_MILESTONES: readonly MilestoneOption[] = []
const NO_PEOPLE: readonly Assignee[] = []
const NO_TAGS: readonly string[] = []

/**
 * Every Project My tasks can name, by title: the ones its Tasks and the
 * milestones are on, and the Open ones the sidebar lists. My tasks spans
 * closed Projects too, which the sidebar's list leaves out.
 */
function projectChoices(
  tasks: readonly MyTask[],
  milestones: readonly MilestoneOption[],
  open: readonly ProjectChoice[]
): ProjectChoice[] {
  const titles = new Map<string, string>()
  for (const p of open) titles.set(p.name, p.project_name)
  for (const m of milestones) titles.set(m.project, m.project_name)
  for (const t of tasks) titles.set(t.project, t.project_name)
  return [...titles]
    .map(([name, project_name]) => ({ name, project_name }))
    .sort((a, b) => a.project_name.localeCompare(b.project_name))
}

export function MyTasksBoard({
  view = null,
}: {
  /** The Custom View the Board is opened as; none on All my tasks. */
  view?: View | null
}) {
  const { data: tasks, error, isLoading } = useMyTasks()
  const { views } = useViews(null)
  const filters = useBoardFilters(view ? view.filters : null, MY_TASKS_FIELDS)
  const { data: tagList } = useTags()
  const { data: milestoneOptions } = useMilestoneOptions()
  const { data: openProjects } = useProjects()
  const { data: people } = useAssignees()
  const { mutate } = useSWRConfig()

  // Each view remembers its collapsed columns and rows, apart from All my
  // tasks (lib/board-view.ts).
  const boardKey = view ? `my-tasks::${view.name}` : "my-tasks"
  const boardView = useBoardView(boardKey)
  const { boardChanged } = useBoardViewActions()

  const projects = React.useMemo(
    () =>
      projectChoices(
        tasks ?? [],
        milestoneOptions?.message ?? NO_MILESTONES,
        openProjects ?? []
      ),
    [tasks, milestoneOptions, openProjects]
  )
  // Cards name what a Task links to from the list itself, which carries the
  // names, since its Tasks span Projects whose lists the Board does not load.
  const lookups = React.useMemo(
    () => ({
      milestones: new Map(
        (tasks ?? []).flatMap((t) =>
          t.envision_milestone && t.milestone_subject
            ? [[t.envision_milestone, t.milestone_subject] as const]
            : []
        )
      ),
      modules: new Map(
        (tasks ?? []).flatMap((t) =>
          t.envision_module && t.module_name
            ? [[t.envision_module, t.module_name] as const]
            : []
        )
      ),
      people: new Map((people?.message ?? []).map((p) => [p.name, p])),
    }),
    [tasks, people]
  )
  const shown = React.useMemo(
    () => filterTasks(tasks ?? [], filters.filters),
    [tasks, filters.filters]
  )
  // A row for each Project with a Task on My tasks, filtered out or not, so
  // an empty one folds rather than vanishing; with a Project filter, only the
  // Projects it names.
  const rows = React.useMemo(() => {
    const named = new Set(filters.filters.project)
    const mine = new Set((tasks ?? []).map((t) => t.project))
    return projects.filter((p) =>
      named.size ? named.has(p.name) : mine.has(p.name)
    )
  }, [projects, tasks, filters.filters.project])
  const board = React.useMemo(
    () => toProjectRowsData(shown, rows, boardView, lookups),
    [shown, rows, boardView, lookups]
  )
  const onChange = React.useCallback(
    (next: KanbanData) => boardChanged(boardKey, board, next),
    [board, boardChanged, boardKey]
  )
  const { call: updateTask } = useFrappePostCall<{ message: TaskDetail }>(
    "setu.api.task.update_task"
  )
  // One move of one Task, as ProjectBoard's moveTask: shown at once, saved,
  // and taken back if the save fails. Resolves to whether it was saved.
  const moveTask = React.useCallback(
    (task: MyTask, move: TaskMove): Promise<boolean> =>
      mutate<MyTask[] | undefined, unknown>(
        MY_TASKS_KEY,
        updateTask({ name: task.name, ...move }),
        {
          optimisticData: (_committed, displayed) =>
            displayed && applyTaskMove(displayed, task.name, move),
          populateCache: false,
        }
      )
        .then(() => {
          // The Task's Project Board too, besides what a move there updates.
          void mutate(projectTasksKey(task.project))
          void mutate(isMilestoneProgressKey)
          void mutate(taskKey(task.name))
          void mutate(taskActivityKey(task.name))
          return true
        })
        .catch((error: FrappeError) => {
          toast.error(`“${task.subject}” could not be moved`, {
            description: frappeErrorMessage(error),
          })
          return false
        }),
    [mutate, updateTask]
  )
  const onItemMove = React.useCallback<
    NonNullable<KanbanBoardProps["onItemMove"]>
  >(
    ({ item, from, to }) => {
      // The board has no way to keep a Card in its row, so a drop on another
      // Project's is left unsaved: the Board, given the same data, puts the
      // Card back.
      if (to.swimlaneId !== from.swimlaneId) return
      const move = taskMove(
        { columnId: from.columnId },
        { columnId: to.columnId }
      )
      const task = tasks?.find((t) => t.name === item.id)
      if (!move?.status || !task) return
      const undo: TaskMove = {
        status: boardStatus(task.status) ?? columnCreateStatus(from.columnId),
      }
      const where =
        BOARD_COLUMNS.find((column) => column.id === to.columnId)?.title ??
        move.status
      void moveTask(task, move).then((saved) => {
        if (!saved) return
        toast(`Moved to ${where}`, {
          description: task.subject,
          action: {
            label: "Undo",
            onClick: () =>
              void moveTask(applyTaskMove([task], task.name, move)[0], undo),
          },
        })
      })
    },
    [moveTask, tasks]
  )
  const navigate = useNavigate()
  const onItemClick = React.useCallback(
    (item: KanbanItem) => {
      const task = tasks?.find((t) => t.name === item.id)
      if (!task) return
      void navigate({
        to: "/projects/$name/tasks/$task",
        params: { name: task.project, task: task.name },
      })
    },
    [navigate, tasks]
  )
  const renderDragPreview = React.useCallback(
    (item: KanbanItem) => <TaskDragPreview data={item.data as TaskCardData} />,
    []
  )

  return (
    <>
      <MyTasksHeader
        page={view?.view_name}
        badge={view ? <OnlyYouBadge /> : undefined}
      />
      <main className="flex min-h-0 flex-1 flex-col">
        <BoardToolbar
          project={null}
          view={view}
          views={views ?? NO_VIEWS}
          board={filters}
          projects={projects}
          milestones={milestoneOptions?.message ?? NO_MILESTONES}
          people={people?.message ?? NO_PEOPLE}
          tags={tagList?.message.tags ?? NO_TAGS}
        />
        {isLoading || (!tasks && !error) ? (
          <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-6">
            {BOARD_COLUMNS.map((column) => (
              <Skeleton key={column.id} className="h-full w-80 shrink-0" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {frappeErrorMessage(error)}
          </div>
        ) : (
          <KanbanBoard
            aria-label="My tasks"
            renderers={renderers}
            data={board}
            onChange={onChange}
            palette={BOARD_PALETTE}
            readOnly
            allowItemDrag
            onItemMove={onItemMove}
            onItemClick={onItemClick}
            layout="rows"
            renderDragPreview={renderDragPreview}
            // A moved Task goes first in its new cell (applyTaskMove).
            dropLandsFirst
            className={cn(
              "min-h-0 flex-1",
              // Rows pad themselves, around their pinned headers; with no
              // Tasks at all the Board is plain columns, padded from here.
              board.swimlanes?.length ? "[--board-pad:1.5rem]" : "[&>div]:p-6"
            )}
          />
        )}
      </main>
    </>
  )
}
