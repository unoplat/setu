import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { useProjects, type ProjectSummary } from "@/lib/projects"
import { propertyTriggerClassName } from "@/lib/style"

/** The project's square, as the property list draws it (06d, 07d). */
function ProjectSwatch() {
  return <span className="size-3 shrink-0 rounded-[3px] bg-primary" />
}

// The Assignee picker's "Combobox in Popup", for the project a record belongs
// to. It offers the projects the sidebar lists (open, managed in Envision);
// a record always has one, so there is no clearing it.
export function ProjectCombobox({
  id,
  value,
  onChange,
  onBlur,
  current = null,
  variant = "field",
}: {
  id: string
  /** A Project's name (its id). */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /**
   * The project the record is in now, shown even when the list leaves it
   * out (a completed project, or past the list's limit).
   */
  current?: ProjectSummary | null
  /** "field": a form's outlined field (07a). "inline": a property (07d). */
  variant?: "field" | "inline"
}) {
  const inline = variant === "inline"
  const { data, isLoading } = useProjects()
  const projects = data ?? []
  const selected =
    projects.find((project) => project.name === value) ??
    (current?.name === value ? current : null)

  return (
    <Combobox
      items={projects}
      value={selected}
      onValueChange={(project) => {
        if (project) onChange(project.name)
      }}
      itemToStringLabel={(project) => project.project_name || project.name}
      itemToStringValue={(project) => project.name}
      isItemEqualToValue={(item, current) => item.name === current.name}
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
    >
      <ComboboxTrigger
        render={
          <Button
            id={id}
            type="button"
            variant={inline ? "ghost" : "outline"}
            disabled={isLoading && !selected}
            className={
              inline
                ? `${propertyTriggerClassName} gap-2 [&>svg:last-child]:size-3`
                : "h-11 w-full justify-between gap-2 rounded-xl px-3.5 font-normal"
            }
          />
        }
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <ProjectSwatch />
            <span className="truncate">
              {selected.project_name || selected.name}
            </span>
          </span>
        ) : (
          <span className="grow text-start text-muted-foreground">
            {isLoading ? "Loading projects…" : "Choose a project"}
          </span>
        )}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder="Search projects" />
        <ComboboxEmpty>No project matches.</ComboboxEmpty>
        <ComboboxList>
          {(project: ProjectSummary) => (
            <ComboboxItem key={project.name} value={project}>
              <ProjectSwatch />
              <span className="truncate">
                {project.project_name || project.name}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
