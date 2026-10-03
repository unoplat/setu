import {
  FlagIcon,
  LayoutGridIcon,
  SettingsIcon,
  SquareCheckIcon,
} from "lucide-react"

// The sections of a Project, listed under it in the sidebar (Paper: "Projects
// and Project Sections"). Each one is a child route of /projects/$name, so a
// section joins this list when its route exists: Message Board and Todos are
// still to come. Custom Views are listed after these (views/nav-views.tsx).

export interface ProjectSection {
  title: string
  /** Named routes, so `params={{ name }}` type-checks against each one. */
  to:
    | "/projects/$name"
    | "/projects/$name/milestones"
    | "/projects/$name/modules"
    | "/projects/$name/settings"
  icon: React.ReactNode
  /** Tasks is the project's index route, so only an exact match is "in" it. */
  exact?: boolean
  /** A record page under another path that still belongs to the section. */
  detail?: "/projects/$name/tasks/$task"
}

export const PROJECT_SECTIONS: readonly ProjectSection[] = [
  {
    title: "Tasks",
    to: "/projects/$name",
    icon: <SquareCheckIcon />,
    exact: true,
    detail: "/projects/$name/tasks/$task",
  },
  {
    title: "Milestones",
    to: "/projects/$name/milestones",
    icon: <FlagIcon />,
  },
  {
    title: "Modules",
    to: "/projects/$name/modules",
    icon: <LayoutGridIcon />,
  },
  {
    title: "Settings",
    to: "/projects/$name/settings",
    icon: <SettingsIcon />,
  },
]
