import * as React from "react"
import {
  FrappeContext,
  useFrappeGetCall,
  useSWR,
  type FrappeConfig,
} from "frappe-react-sdk"

import type {
  KanbanData,
  KanbanItem,
  KanbanPaletteSwatch,
} from "@/components/kanban-board"
import type { Assignee } from "@/lib/assignees"
import { useConfirmCount } from "@/lib/confirm-count"
import type { Module } from "@/lib/modules"

/**
 * A project's Tasks as the Board shows them: standard ERPNext Task records,
 * minus the milestones (Tasks with Is Milestone checked, which have a
 * section of their own) and templates.
 */

export interface TaskSummary {
  name: string
  subject: string
  status: string
  priority: string | null
  /** Dates, or datetimes on ERPNext versions that store one. */
  exp_start_date: string | null
  exp_end_date: string | null
  /** Everyone assigned, first assigned first. From Frappe's ToDo records, so
   *  a Done Task keeps them (setu.api.milestone.assignees_of). */
  assignees: string[]
  /** Frappe's document tags: ",tag one,tag two". */
  _user_tags: string | null
  envision_milestone: string | null
  envision_module: string | null
}

/** Shared SWR key so a create or move can revalidate the Board on screen. */
export function projectTasksKey(project: string) {
  return `envision:tasks:${project}`
}

/** A Board's Tasks from `method`, cached under `key` as the bare list. */
function useTaskList<T>(
  key: string,
  method: string,
  params?: Record<string, string>
) {
  const { call } = React.useContext(FrappeContext) as FrappeConfig
  return useSWR(key, () =>
    call
      .get<{ message: T[] }>(method, params)
      .then((response) => response.message)
  )
}

/**
 * From setu.api.task.list_project_tasks, cached as the bare list, so a move
 * on the Board can show itself in the cache (project-board.tsx).
 */
export function useProjectTasks(project: string) {
  return useTaskList<TaskSummary>(
    projectTasksKey(project),
    "setu.api.task.list_project_tasks",
    { project }
  )
}

/**
 * A Task on My tasks (CONTEXT.md): one assigned to the signed-in user, on any
 * Envision-enabled Project, with that Project and the names of its Milestone
 * and Module, which the Card would otherwise look up in the Project's lists.
 */
export interface MyTask extends TaskSummary {
  project: string
  project_name: string
  milestone_subject: string | null
  module_name: string | null
}

export const MY_TASKS_KEY = "envision:my-tasks"

/**
 * From setu.api.task.list_my_tasks, Done Tasks included, cached as the bare
 * list as the Project's are (my-tasks-board.tsx).
 */
export function useMyTasks() {
  return useTaskList<MyTask>(MY_TASKS_KEY, "setu.api.task.list_my_tasks")
}

/** What ties a Task to the page it is listed on: one of the two. */
export type TaskLink = { milestone: string } | { module: string }

/**
 * The project's Tasks linked to one milestone or filed under one module, from
 * the list the Board already loads, and how many of them are Done. Cancelled
 * Tasks are not in that list, so they count for nothing here.
 */
export function useRelatedTasks(project: string, link: TaskLink) {
  const { data, isLoading } = useProjectTasks(project)
  const id = "milestone" in link ? link.milestone : link.module
  const field = "milestone" in link ? "envision_milestone" : "envision_module"
  const tasks = React.useMemo(
    () => (data ?? []).filter((task) => task[field] === id),
    [data, field, id]
  )
  return {
    tasks,
    total: tasks.length,
    done: tasks.filter((task) => task.status === "Completed").length,
    loading: isLoading || !data,
  }
}

/**
 * The Board's columns, in Paper order (02 — Empty Mobile App Board). Each one
 * presents ERPNext Task Statuses under Envision's names (CONTEXT.md, Status);
 * Blocked is the one Envision adds (setu/setup/property_setters.py).
 * `createStatus` is the Status a Task created from the column gets. Cancelled
 * Tasks are left off the Board, and the query above never fetches them.
 */
export const BOARD_COLUMNS = [
  {
    id: "todo",
    title: "Todo",
    color: "todo",
    statuses: ["Open", "Overdue"],
    createStatus: "Open",
  },
  {
    id: "in-progress",
    title: "In Progress",
    color: "in-progress",
    statuses: ["Working"],
    createStatus: "Working",
  },
  {
    id: "review",
    title: "Review",
    color: "review",
    statuses: ["Pending Review"],
    createStatus: "Pending Review",
  },
  {
    id: "blocked",
    title: "Blocked",
    color: "blocked",
    statuses: ["Blocked"],
    createStatus: "Blocked",
  },
  {
    id: "done",
    title: "Done",
    color: "done",
    statuses: ["Completed"],
    createStatus: "Completed",
  },
] as const

export type BoardColumnId = (typeof BOARD_COLUMNS)[number]["id"]

/** The Statuses a Task can be created in (setu.api.task.CREATE_STATUSES). */
export type CreateStatus = (typeof BOARD_COLUMNS)[number]["createStatus"]

export function columnCreateStatus(columnId: string): CreateStatus {
  return (
    BOARD_COLUMNS.find((column) => column.id === columnId)?.createStatus ??
    "Open"
  )
}

/**
 * The Status a Task's column stands for, as the Status picker holds it:
 * Overdue is Todo's. Null for the Statuses the Board leaves off (Cancelled).
 */
export function boardStatus(status: string): CreateStatus | null {
  return (
    BOARD_COLUMNS.find((column) =>
      (column.statuses as readonly string[]).includes(status)
    )?.createStatus ?? null
  )
}

/** A Task as its page needs it (setu.api.task.get_task, Paper 09). */
export interface TaskDetail {
  name: string
  subject: string
  /** The rich text editor's HTML, or "" when there is none. */
  description: string
  /** ERPNext's Status, Overdue and Cancelled included. */
  status: string
  priority: string | null
  /** ISO days, not the Task's datetimes. */
  start_date: string | null
  due_date: string | null
  /** The first assignee. Task screens use `assignees`. */
  assignee: Assignee | null
  /** Everyone assigned, first assigned first; closed assignments included,
   *  so a Done Task keeps them (setu.api.task.task_detail). */
  assignees: Assignee[]
  /** The linked milestone's and module's names (ids). */
  milestone: string | null
  module: string | null
  tags: string[]
  project: string | null
  project_name: string | null
  owner: string
  /** ISO datetimes with their offsets. */
  creation: string
  modified: string
  /** Whether this user may edit it; read-only viewers get no editor. */
  can_write: boolean
  /** Whether this user may permanently delete it and its subtasks. */
  can_delete: boolean
}

export function taskKey(name: string) {
  return ["envision:task", name]
}

export function useTask(name: string) {
  return useFrappeGetCall<{ message: TaskDetail }>(
    "setu.api.task.get_task",
    { name },
    taskKey(name)
  )
}

/** The Task's timeline (setu.api.task.get_task_activity). */
export function taskActivityKey(name: string) {
  return ["envision:task-activity", name]
}

/**
 * How many descendant Tasks deletion takes with it, including nested subtasks
 * (setu.api.task.count_subtasks).
 */
export function useSubtaskCount(name: string) {
  return useConfirmCount<{ subtasks: number }>(
    "setu.api.task.count_subtasks",
    { name },
    ["envision:task-subtasks", name]
  )
}

/** A Status under its Board column's name: "Working" is "In Progress". */
export function statusTitle(status: string): string {
  return (
    BOARD_COLUMNS.find((column) =>
      (column.statuses as readonly string[]).includes(status)
    )?.title ?? status
  )
}

/** ERPNext's Task priorities, lowest first. */
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const

export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/** Paper colours only the priorities that ask for attention. */
export const PRIORITY_CLASS: Record<TaskPriority, string> = {
  Urgent: "text-destructive",
  High: "text-sidebar-primary",
  Medium: "text-muted-foreground",
  Low: "text-muted-foreground",
}

/** Every Frappe tag on the site; tags are site-wide, not per Project. */
export const TAGS_KEY = "envision:tags"

export interface TagList {
  tags: string[]
  /** Whether this user may delete a tag everywhere (System Managers). */
  can_delete: boolean
}

export function useTags() {
  return useFrappeGetCall<{ message: TagList }>(
    "setu.api.task.list_tags",
    undefined,
    TAGS_KEY
  )
}

/** Where a tag is, for the confirm before deleting it everywhere. */
export interface TagUsage {
  tasks: number
  /** How many Projects those Tasks are in. */
  projects: number
  /** Other documents Desk put the tag on. */
  others: number
}

export function useTagUsage(tag: string | null) {
  return useFrappeGetCall<{ message: TagUsage }>(
    "setu.api.task.get_tag_usage",
    tag === null ? undefined : { tag },
    // Always fresh: the confirm states how many Tasks lose the tag.
    tag === null ? null : ["envision:tag-usage", tag],
    { revalidateOnMount: true, dedupingInterval: 0 }
  )
}

/**
 * Whether an SWR key holds Tasks (a Board or a Task page), which a tag
 * deleted everywhere has just come off.
 */
export function isTasksKey(key: unknown): boolean {
  return Array.isArray(key)
    ? key[0] === taskKey("")[0]
    : typeof key === "string" &&
        (key.startsWith(projectTasksKey("")) || key === MY_TASKS_KEY)
}

/** Column accents from the Paper board's left borders and status markers. */
export const BOARD_PALETTE: KanbanPaletteSwatch[] = [
  { id: "todo", label: "Todo", cssVar: "--muted-foreground" },
  { id: "in-progress", label: "In Progress", cssVar: "--primary" },
  { id: "review", label: "Review", cssVar: "--chart-3" },
  { id: "blocked", label: "Blocked", cssVar: "--destructive" },
  { id: "done", label: "Done", cssVar: "--success" },
]

/**
 * What a Task Card shows (Paper: Task Card — Default Clean), with its links
 * already resolved to names. The Board column supplies the Status, so the
 * Card only carries whether the Task is overdue.
 */
export interface TaskCardData {
  id: string
  title: string
  priority: TaskPriority | null
  overdue: boolean
  /** ISO days. */
  startDate: string | null
  dueDate: string | null
  milestone: string | null
  module: string | null
  tags: string[]
  assignee: Assignee | null
}

/** Names for the ids a Task links to, from lists the app already loads. */
export interface TaskCardLookups {
  milestones: ReadonlyMap<string, string>
  modules: ReadonlyMap<string, string>
  people: ReadonlyMap<string, Assignee>
}

export const TASK_CARD_RENDERER_ID = "task-card"

function isoDay(value: string | null): string | null {
  return value ? value.slice(0, 10) : null
}

function taskCard(task: TaskSummary, lookups: TaskCardLookups): KanbanItem {
  const assignee = task.assignees[0] ?? null
  const data: TaskCardData = {
    id: task.name,
    title: task.subject,
    priority: TASK_PRIORITIES.find((p) => p === task.priority) ?? null,
    // Overdue is ERPNext's flag for an open Task past its due date, not a
    // column of its own, so the Card carries it instead.
    overdue: task.status === "Overdue",
    startDate: isoDay(task.exp_start_date),
    dueDate: isoDay(task.exp_end_date),
    milestone: task.envision_milestone
      ? (lookups.milestones.get(task.envision_milestone) ??
        task.envision_milestone)
      : null,
    module: task.envision_module
      ? (lookups.modules.get(task.envision_module) ?? task.envision_module)
      : null,
    tags: (task._user_tags ?? "").split(",").filter(Boolean),
    // Someone the picker leaves out (a disabled user) still shows, by id.
    assignee: assignee
      ? (lookups.people.get(assignee) ?? {
          name: assignee,
          full_name: "",
          user_image: null,
        })
      : null,
  }
  return { id: task.name, rendererId: TASK_CARD_RENDERER_ID, data }
}

/**
 * The section for Tasks with no Module. Module ids are "MOD-#####", so it
 * cannot clash with one.
 */
export const NO_MODULE_SECTION = "no-module"

/** A section's key in the page's state: its column and its swimlane. */
export function sectionKey(columnId: string, swimlaneId: string): string {
  return `${columnId}::${swimlaneId}`
}

/**
 * The Module a Task created from a section gets: "" for No module. Mirrors
 * columnCreateStatus.
 */
export function sectionCreateModule(swimlaneId: string): string {
  return swimlaneId === NO_MODULE_SECTION ? "" : swimlaneId
}

/** Where a Card sits on the Board: its column and, with sections, its section. */
export interface BoardPlace {
  columnId: string
  swimlaneId?: string
}

/**
 * What dragging a Card changes on its Task, as setu.api.task.update_task takes
 * it: the Status of the column it lands in and the Module of the section.
 * Only what changed is sent, so a move never overwrites the other field.
 */
export interface TaskMove {
  status?: CreateStatus
  /** "" for No module. */
  module?: string
}

/**
 * The change a drag from `from` to `to` makes, or null when the Card lands in
 * its own column and section (a reorder, which the Board does not keep).
 * Overdue Tasks share Todo, so a move within Todo leaves the Status alone.
 */
export function taskMove(from: BoardPlace, to: BoardPlace): TaskMove | null {
  const move: TaskMove = {}
  if (to.columnId !== from.columnId) {
    move.status = columnCreateStatus(to.columnId)
  }
  if (to.swimlaneId !== undefined && to.swimlaneId !== from.swimlaneId) {
    move.module = sectionCreateModule(to.swimlaneId)
  }
  return move.status === undefined && move.module === undefined ? null : move
}

/**
 * The Board's Tasks with `move` applied to one, before the server confirms it.
 * The Task goes first, where the list (newest change first) will have it.
 */
export function applyTaskMove<T extends TaskSummary>(
  tasks: T[],
  name: string,
  move: TaskMove
): T[] {
  const task = tasks.find((t) => t.name === name)
  if (!task) return tasks
  const moved: T = {
    ...task,
    ...(move.status !== undefined && { status: move.status }),
    ...(move.module !== undefined && { envision_module: move.module || null }),
  }
  return [moved, ...tasks.filter((t) => t !== task)]
}

/** What the user last did to a section, and whether it was empty then. */
export interface SectionOverride {
  collapsed: boolean
  wasEmpty: boolean
}

/** What the Board remembers until reload. */
export interface BoardView {
  collapsedColumns: ReadonlySet<string>
  sections: ReadonlyMap<string, SectionOverride>
}

/**
 * Whether a section shows collapsed. Empty sections start collapsed and ones
 * with cards start open; the user's last choice wins, except one made while
 * the section was empty, which is dropped once a Task arrives so it opens.
 */
function sectionCollapsed(
  override: SectionOverride | undefined,
  count: number
): boolean {
  if (override && !(override.wasEmpty && count > 0)) return override.collapsed
  return count === 0
}

/**
 * The Board's columns with each Task under its Status and, when the Project
 * has Modules, in its Module's section. "No module" comes first, then the
 * Modules in the order given. A Task whose Module is not listed (deleted in
 * Desk) lands in No module rather than disappearing.
 */
export function toBoardData(
  tasks: TaskSummary[],
  modules: readonly Pick<Module, "name" | "module_name">[],
  view: BoardView,
  lookups: TaskCardLookups
): KanbanData {
  const known = new Set(modules.map((m) => m.name))
  return laneBoardData(
    tasks,
    modules.length === 0
      ? undefined
      : [
          { id: NO_MODULE_SECTION, title: "No module" },
          ...modules.map((m) => ({ id: m.name, title: m.module_name })),
        ],
    (task) => {
      const module = task.envision_module
      return module && known.has(module) ? module : NO_MODULE_SECTION
    },
    view,
    lookups
  )
}

/**
 * My tasks' Board (Paper: My Tasks 05): the same columns, with a row for each
 * Project in the order given instead of a section for each Module.
 */
export function toProjectRowsData(
  tasks: MyTask[],
  projects: readonly { name: string; project_name: string }[],
  view: BoardView,
  lookups: TaskCardLookups
): KanbanData {
  return laneBoardData(
    tasks,
    projects.length === 0
      ? undefined
      : projects.map((p) => ({ id: p.name, title: p.project_name })),
    (task) => task.project,
    view,
    lookups
  )
}

/**
 * The columns with each Task under its Status and, given `swimlanes`, in the
 * one `laneOf` names. Each section starts collapsed when empty (BoardView).
 */
function laneBoardData<T extends TaskSummary>(
  tasks: T[],
  swimlanes: { id: string; title: string }[] | undefined,
  laneOf: (task: T) => string,
  view: BoardView,
  lookups: TaskCardLookups
): KanbanData {
  return {
    ...(swimlanes && { swimlanes }),
    columns: BOARD_COLUMNS.map((column) => {
      const items = tasks
        .filter((task) =>
          (column.statuses as readonly string[]).includes(task.status)
        )
        .map((task) => {
          const card = taskCard(task, lookups)
          if (!swimlanes) return card
          return { ...card, swimlaneId: laneOf(task) }
        })
      const base = {
        id: column.id,
        title: column.title,
        color: column.color,
        collapsed: view.collapsedColumns.has(column.id),
        items,
      }
      if (!swimlanes) return base
      return {
        ...base,
        collapsedSwimlanes: swimlanes
          .filter((lane) =>
            sectionCollapsed(
              view.sections.get(sectionKey(column.id, lane.id)),
              items.filter((item) => item.swimlaneId === lane.id).length
            )
          )
          .map((lane) => lane.id),
      }
    }),
  }
}

/**
 * The section overrides after the board reports `next` (from KanbanBoard's
 * onChange): each section whose collapsed state differs between `current` and
 * `next` is recorded with its new state and whether it was empty. Returns
 * `sections` itself when nothing changed, so a React state setter bails out.
 */
export function nextSectionOverrides(
  current: KanbanData,
  next: KanbanData,
  sections: ReadonlyMap<string, SectionOverride>
): ReadonlyMap<string, SectionOverride> {
  let result: Map<string, SectionOverride> | null = null
  for (const column of next.columns) {
    const before = new Set(
      current.columns.find((c) => c.id === column.id)?.collapsedSwimlanes
    )
    const after = new Set(column.collapsedSwimlanes)
    for (const lane of next.swimlanes ?? []) {
      const collapsed = after.has(lane.id)
      if (collapsed === before.has(lane.id)) continue
      result ??= new Map(sections)
      result.set(sectionKey(column.id, lane.id), {
        collapsed,
        wasEmpty: !column.items.some((item) => item.swimlaneId === lane.id),
      })
    }
  }
  return result ?? sections
}
