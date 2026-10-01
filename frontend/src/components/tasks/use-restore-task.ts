import * as React from "react"
import {
  useFrappePostCall,
  useSWRConfig,
  type FrappeError,
} from "frappe-react-sdk"
import { toast } from "sonner"

import { frappeErrorMessage } from "@/lib/frappe-error"
import { milestonesKey } from "@/lib/milestones"
import { archivedTasksKey, projectTasksKey } from "@/lib/tasks"

/**
 * Restore an archived Task and the subtasks that went with it (Paper: Task
 * Archive 03's Undo and 04's Restore), then refresh the Board and Archived.
 * Resolves to whether it was restored; a refusal is said in a toast.
 */
export function useRestoreTask(project: string) {
  const { mutate } = useSWRConfig()
  const { call } = useFrappePostCall<{ message: { subtasks: number } }>(
    "setu.api.task.restore_task"
  )
  return React.useCallback(
    async (task: { name: string; subject: string }): Promise<boolean> => {
      try {
        await call({ name: task.name })
      } catch (error) {
        toast.error(`“${task.subject}” could not be restored`, {
          description: frappeErrorMessage(error as FrappeError),
        })
        return false
      }
      void mutate(projectTasksKey(project))
      void mutate(archivedTasksKey(project))
      void mutate(milestonesKey(project))
      toast.success(`“${task.subject}” restored`)
      return true
    },
    [call, mutate, project]
  )
}
