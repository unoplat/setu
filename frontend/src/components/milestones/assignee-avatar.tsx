import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials, type Assignee } from "@/lib/assignees"

/** The small avatar the milestone screens put next to a person's name. */
export function AssigneeAvatar({ person }: { person: Assignee }) {
  return (
    <Avatar size="sm">
      {person.user_image ? (
        <AvatarImage src={person.user_image} alt="" />
      ) : null}
      <AvatarFallback className="text-[9px] font-semibold text-foreground">
        {initials(person)}
      </AvatarFallback>
    </Avatar>
  )
}
