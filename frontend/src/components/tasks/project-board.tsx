import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  useFrappeGetDoc,
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
import { ProjectHeader } from "@/components/project-header"
import { CreateTaskSheet } from "@/components/tasks/create-task-sheet"
import { TaskDragPreview } from "@/components/tasks/task-card"
import { taskCardRenderer } from "@/components/tasks/task-card-renderer"
import { Skeleton } from "@/components/ui/skeleton"
import { BoardToolbar } from "@/components/views/board-toolbar"
import { OnlyYouBadge } from "@/components/views/only-you-badge"
import { useAssignees, type Assignee } from "@/lib/assignees"
import { useBoardView, useBoardViewActions } from "@/lib/board-view"
import { frappeErrorMessage } from "@/lib/frappe-error"
import {
  isMilestoneProgressKey,
  useMilestones,
  type Milestone,
} from "@/lib/milestones"
import { useModules } from "@/lib/modules"
import {
  filterTasks,
  PROJECT_BOARD_FIELDS,
  useBoardFilters,
} from "@/lib/task-filters"
import {
  applyTaskMove,
  boardStatus,
  BOARD_COLUMNS,
  BOARD_PALETTE,
  columnCreateStatus,
  projectTasksKey,
  sectionCreateModule,
  taskActivityKey,
  taskKey,
  taskMove,
  toBoardData,
  useProjectTasks,
  useTags,
  type CreateStatus,
  type TaskCardData,
  type TaskDetail,
  type TaskMove,
  type TaskSummary,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"
import { useViews, type View } from "@/lib/views"

// The Project's Board, as All tasks (the Tasks section) and as a Custom View
// (Paper: "Custom view journey"). A view is the same Board behind saved
// filters: it loads the same Tasks and only shows the ones that pass, so a
// Card moved or a Task created in a view changes it for everyone, as on All
// tasks.
//
// Paper: 11 — Board: module rows across columns. The Status columns run
// across the top and each Module is a collapsible row under them ("No module"
// first), its name on one header that stays in view. A column's "+" opens
// Create Task (03) in that column's Status; a row's "+" opens it in that
// Module. A Card opens its Task's page (09). Dragging a Card to another column
// changes its Status, and to another row its Module (11a): the Board shows the
// move at once, says where the Card went with an Undo, and takes the move back
// if the save fails.
const renderers = [taskCardRenderer]

// Stable empties, so the toolbar's lists keep their identity while loading.
const NO_VIEWS: readonly View[] = []
const NO_MILESTONES: readonly Milestone[] = []
const NO_PEOPLE: readonly Assignee[] = []
const NO_TAGS: readonly string[] = []

export function ProjectBoard({
  project: name,
  view = null,
}: {
  project: string
  /** The Custom View the Board is opened as; none on All tasks. */
  view?: View | null
}) {
  const { data: project } = useFrappeGetDoc<{ project_name?: string }>(
    "Project",
    name
  )
  const projectName = project?.project_name ?? name
  const { data: tasks, error, isLoading } = useProjectTasks(name)
  const { views } = useViews(name)
  const filters = useBoardFilters(
    view ? view.filters : null,
    PROJECT_BOARD_FIELDS
  )
  const { data: tagList } = useTags()
  const { mutate } = useSWRConfig()

  // Where Create Task was opened from; null while the panel is closed.
  const [createIn, setCreateIn] = React.useState<{
    status: CreateStatus
    module: string
  } | null>(null)
  const onColumnAdd = React.useCallback((columnId: string) => {
    setCreateIn({ status: columnCreateStatus(columnId), module: "" })
  }, [])

  // Collapsing a column or a section is the one change a read-only board
  // makes. It is remembered until reload, opening a Task and coming back
  // included, so it lives in a store rather than in this page.
  // Each view remembers its own, apart from All tasks.
  const boardKey = view ? `${name}::${view.name}` : name
  const boardView = useBoardView(boardKey)
  const { boardChanged } = useBoardViewActions()
  // Cards show names for what a Task links to. These lists are the ones the
  // Milestones and Modules sections and the pickers already load, so the
  // Board adds no queries of its own; until they arrive a Card shows ids.
  const { data: milestones } = useMilestones(name)
  const { data: modules } = useModules(name)
  const { data: people } = useAssignees()
  const lookups = React.useMemo(
    () => ({
      milestones: new Map(
        (milestones?.message ?? []).map((m) => [m.name, m.subject])
      ),
      modules: new Map(
        (modules?.message ?? []).map((m) => [m.name, m.module_name])
      ),
      people: new Map((people?.message ?? []).map((p) => [p.name, p])),
    }),
    [milestones, modules, people]
  )
  const shown = React.useMemo(
    () => filterTasks(tasks ?? [], filters.filters),
    [tasks, filters.filters]
  )
  const board = React.useMemo(
    () => toBoardData(shown, modules?.message ?? [], boardView, lookups),
    [shown, modules, boardView, lookups]
  )
  const onChange = React.useCallback(
    (next: KanbanData) => boardChanged(boardKey, board, next),
    [board, boardChanged, boardKey]
  )
  const { call: updateTask } = useFrappePostCall<{ message: TaskDetail }>(
    "setu.api.task.update_task"
  )
  // One move of one Task: shown at once, saved, and taken back if the save
  // fails. Resolves to whether it was saved.
  const moveTask = React.useCallback(
    (task: TaskSummary, move: TaskMove): Promise<boolean> =>
      // SWR shows the move, puts the list back if the save fails, and
      // refetches the Board either way. The save answers with the one Task,
      // not the list, so it is kept out of the cache.
      mutate<TaskSummary[] | undefined, unknown>(
        projectTasksKey(name),
        updateTask({ name: task.name, ...move }),
        {
          // On the list as displayed, so a move still being saved stays put.
          optimisticData: (_committed, displayed) =>
            displayed && applyTaskMove(displayed, task.name, move),
          populateCache: false,
        }
      )
        .then(() => {
          // As a save on the Task's page: a milestone's progress, the Task's
          // page and its timeline all follow.
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
    [mutate, name, updateTask]
  )
  const onItemMove = React.useCallback<
    NonNullable<KanbanBoardProps["onItemMove"]>
  >(
    ({ item, from, to }) => {
      const move = taskMove(from, to)
      const task = tasks?.find((t) => t.name === item.id)
      if (!move || !task) return
      // Only what the move changed is named, and put back by Undo.
      const undo: TaskMove = {}
      const where: string[] = []
      if (move.status !== undefined) {
        undo.status =
          boardStatus(task.status) ?? columnCreateStatus(from.columnId)
        where.push(
          BOARD_COLUMNS.find((column) => column.id === to.columnId)?.title ??
            move.status
        )
      }
      if (move.module !== undefined) {
        undo.module = task.envision_module ?? ""
        where.push(
          move.module
            ? (lookups.modules.get(move.module) ?? move.module)
            : "No module"
        )
      }
      void moveTask(task, move).then((saved) => {
        if (!saved) return
        toast(`Moved to ${where.join(" · ")}`, {
          description: task.subject,
          action: {
            label: "Undo",
            onClick: () =>
              void moveTask(applyTaskMove([task], task.name, move)[0], undo),
          },
        })
      })
    },
    [lookups, moveTask, tasks]
  )
  const navigate = useNavigate()
  const onItemClick = React.useCallback(
    (item: KanbanItem) =>
      void navigate({
        to: "/projects/$name/tasks/$task",
        params: { name, task: item.id },
      }),
    [name, navigate]
  )
  const onSwimlaneAdd = React.useCallback((swimlaneId: string) => {
    // A row spans every Status, so its "+" starts the Task in the first.
    setCreateIn({ status: "Open", module: sectionCreateModule(swimlaneId) })
  }, [])
  const renderDragPreview = React.useCallback(
    (item: KanbanItem) => <TaskDragPreview data={item.data as TaskCardData} />,
    []
  )

  return (
    <>
      <ProjectHeader
        name={name}
        projectName={projectName}
        section={view ? view.view_name : "Tasks"}
        badge={view ? <OnlyYouBadge /> : undefined}
      />
      <main className="flex min-h-0 flex-1 flex-col">
        <BoardToolbar
          project={name}
          view={view}
          views={views ?? NO_VIEWS}
          board={filters}
          milestones={milestones?.message ?? NO_MILESTONES}
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
            aria-label={`${projectName} Tasks`}
            renderers={renderers}
            data={board}
            onChange={onChange}
            palette={BOARD_PALETTE}
            readOnly
            allowItemDrag
            onItemMove={onItemMove}
            onColumnAdd={onColumnAdd}
            onItemClick={onItemClick}
            layout="rows"
            onSwimlaneAdd={onSwimlaneAdd}
            renderDragPreview={renderDragPreview}
            // A moved Task goes first in its new cell (applyTaskMove).
            dropLandsFirst
            className={cn(
              "min-h-0 flex-1",
              // Rows pad themselves, around their pinned headers; without
              // Modules the Board is plain columns and is padded from here.
              board.swimlanes?.length ? "[--board-pad:1.5rem]" : "[&>div]:p-6"
            )}
          />
        )}
      </main>
      <CreateTaskSheet
        open={createIn !== null}
        onOpenChange={(open) => {
          if (!open) setCreateIn(null)
        }}
        project={name}
        projectName={projectName}
        status={createIn?.status ?? "Open"}
        module={createIn?.module}
        // A new Task can be linked to a milestone in the form.
        onCreated={() =>
          Promise.all([
            mutate(projectTasksKey(name)),
            mutate(isMilestoneProgressKey),
          ])
        }
      />
    </>
  )
}
