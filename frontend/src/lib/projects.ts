import { useFrappeGetDocList } from "frappe-react-sdk"

export interface ProjectSummary {
  name: string
  project_name: string
  status?: string
}

/** Shared SWR key so a create can revalidate every list on screen. */
export const PROJECTS_KEY = "envision:projects"

/**
 * Projects listed in the sidebar and on the Projects landing screen: open
 * projects flagged as managed in Envision.
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
