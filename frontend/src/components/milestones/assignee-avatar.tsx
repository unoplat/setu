import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials, type Assignee } from "@/lib/assignees"

/** The small avatar the milestone screens put next to a person's name. */
export function AssigneeAvatar({
  person,
  className,
}: {
  person: Assignee
  className?: string
}) {
  return (
    <Avatar size="sm" className={className}>
      {person.user_image ? (
        <AvatarImage src={person.user_image} alt="" />
      ) : null}
      <AvatarFallback className="font-semibold text-foreground group-data-[size=sm]/avatar:text-avatar">
        {initials(person)}
      </AvatarFallback>
    </Avatar>
  )
}
