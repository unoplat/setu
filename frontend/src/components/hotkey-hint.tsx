import { formatForDisplay } from "@tanstack/react-hotkeys"

import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  chordTokens,
  formatBinding,
  useBinding,
  type Binding,
  type CommandId,
} from "@/lib/commands"

/**
 * Platform-aware display of a binding. macOS gets symbols (⌘ ⇧ E), Windows
 * and Linux get labels (Ctrl+Shift+E), both from TanStack's formatter.
 */

// Repeated values (e.g. G then G) need distinct identities. Count occurrences
// per value, not positions in the list, so unrelated insertions/reorders are safe.
function keyedKeycaps<T extends string>(values: T[]) {
  const occurrences = new Map<T, number>()
  return values.map((value) => {
    const occurrence = occurrences.get(value) ?? 0
    occurrences.set(value, occurrence + 1)
    return { value, id: JSON.stringify([value, occurrence]) }
  })
}

/** Keycap rendering of a binding. */
export function BindingKeys({
  binding,
  className,
}: {
  binding: Binding | null
  className?: string
}) {
  if (!binding) return null
  if (binding.kind === "sequence") {
    return (
      <KbdGroup className={className}>
        {keyedKeycaps(binding.keys).map(({ value: key, id }, index) => (
          <span key={id} className="inline-flex items-center gap-1">
            {index > 0 ? (
              <span className="text-[10px] text-muted-foreground">then</span>
            ) : null}
            <Kbd>{formatForDisplay(key)}</Kbd>
          </span>
        ))}
      </KbdGroup>
    )
  }
  return (
    <KbdGroup className={className}>
      {keyedKeycaps(chordTokens(binding)).map(({ value: token, id }) => (
        <Kbd key={id}>{token}</Kbd>
      ))}
    </KbdGroup>
  )
}

/** Inline text of a command's current binding ("⌘⇧E"); nothing when unbound. */
export function HotkeyText({
  command,
  className,
}: {
  command: CommandId
  className?: string
}) {
  const binding = useBinding(command)
  if (!binding) return null
  return <span className={className}>{formatBinding(binding)}</span>
}

/** Keycaps for a command's current binding; renders nothing when unbound. */
export function HotkeyHint({
  command,
  className,
}: {
  command: CommandId
  className?: string
}) {
  const binding = useBinding(command)
  return <BindingKeys binding={binding} className={className} />
}
