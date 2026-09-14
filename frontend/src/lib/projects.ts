import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk"

export interface ProjectSummary {
  name: string
  project_name: string
  status?: string
}

/** Shared SWR key so a create can revalidate every list on screen. */
export const PROJECTS_KEY = "envision:projects"

/**
 * Projects listed in the sidebar and on the Projects landing screen: open
 * projects flagged as managed in Envision. Membership filtering happens
 * server-side through setu.permissions.project, so this list is already
 * limited to what the signed-in user may see.
 */
export function useProjects() {
  return useFrappeGetDocList<ProjectSummary>(
    "Project",
    {
      fields: ["name", "project_name"],
      filters: [
        ["status", "=", "Open"],
        ["envision_enabled", "=", 1],
      ],
      orderBy: { field: "modified", order: "desc" },
      limit: 50,
    },
    PROJECTS_KEY
  )
}

export interface InvitableUser {
  name: string
  full_name: string
  user_image?: string | null
}

/** Desk users the signed-in user may invite (setu.api.project.list_invitable_users). */
export function useInvitableUsers() {
  return useFrappeGetCall<{ message: InvitableUser[] }>(
    "setu.api.project.list_invitable_users",
    undefined,
    "envision:invitable-users",
    { revalidateOnFocus: false }
  )
}

/** Shape returned by setu.api.project.create_project. */
export interface CreatedProject extends ProjectSummary {
  members: string[]
}
