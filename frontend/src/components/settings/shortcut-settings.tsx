import * as React from "react"
import { useHotkeySequenceRecorder } from "@tanstack/react-hotkeys"
import { RotateCcwIcon } from "lucide-react"

import { BindingKeys } from "@/components/hotkey-hint"
import { Button } from "@/components/ui/button"
import {
  COMMAND_GROUPS,
  SCOPES,
  findConflicts,
  formatBinding,
  getBinding,
  hotkey,
  isCustomized,
  listCommands,
  sequence,
  resetAllBindings,
  resetBinding,
  setBinding,
  useBindingsVersion,
  useScope,
  type Binding,
  type CommandDefinition,
} from "@/lib/commands"
import { cn } from "@/lib/utils"

/**
 * Keyboard shortcut customisation. Commands are listed from the registry;
 * each row records with TanStack's sequence recorder (one chord becomes a
 * plain hotkey, several become a sequence), checks the bindings store for
 * conflicts in overlapping scopes, and persists the override.
 */
export function ShortcutSettings() {
  const version = useBindingsVersion()
  const commands = React.useMemo(() => listCommands(), [])
  const anyCustomized = commands.some((command) => isCustomized(command.id))

  // Every row owns a recorder and each one listens on the document, so only
  // one may record at a time: starting a row cancels the previous one.
  const cancelActive = React.useRef<(() => void) | null>(null)
  const claimRecorder = React.useCallback((cancel: () => void) => {
    cancelActive.current?.()
    cancelActive.current = cancel
  }, [])

  return (
    <section className="grid gap-6" data-bindings-version={version}>
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Keyboard shortcuts
          </h2>
          <p className="text-sm text-muted-foreground">
            Click a shortcut and press the new keys; press several in a row for
            a sequence. Enter confirms, Escape cancels, Backspace removes the
            last key or clears the shortcut. Shortcuts only fire where their
            command applies.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!anyCustomized}
          onClick={resetAllBindings}
        >
          <RotateCcwIcon />
          Reset all
        </Button>
      </div>

      {COMMAND_GROUPS.map((group) => {
        const rows = commands.filter((command) => command.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="grid gap-2">
            <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group}
            </h3>
            <div className="divide-y rounded-2xl border">
              {rows.map((command) => (
                <ShortcutRow
                  key={command.id}
                  command={command}
                  claimRecorder={claimRecorder}
                />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function ShortcutRow({
  command,
  claimRecorder,
}: {
  command: CommandDefinition
  claimRecorder: (cancel: () => void) => void
}) {
  const binding = getBinding(command.id)
  const customized = isCustomized(command.id)
  const [pending, setPending] = React.useState<{
    binding: Binding
    conflicts: CommandDefinition[]
  } | null>(null)

  const recorder = useHotkeySequenceRecorder({
    onRecord: (steps) => {
      // Backspace on an empty recording reports `[]` after `onClear`.
      const [first, ...rest] = steps
      if (!first) return
      const next = rest.length === 0 ? hotkey(first) : sequence(...steps)
      const conflicts = findConflicts(command.id, next)
      if (conflicts.length > 0) {
        setPending({ binding: next, conflicts })
      } else {
        setBinding(command.id, next)
      }
    },
    onClear: () => setBinding(command.id, null),
    // A pause commits too, so a single chord does not need Enter.
    idleTimeoutMs: 1500,
    ignoreInputs: false,
  })

  function startRecording() {
    setPending(null)
    claimRecorder(recorder.cancelRecording)
    recorder.startRecording()
  }

  // While recording, every other command is muted so the pressed keys are
  // captured instead of executed.
  useScope("shortcut-recorder", recorder.isRecording)

  function apply(replaceOthers: boolean) {
    if (!pending) return
    if (replaceOthers) {
      for (const other of pending.conflicts) setBinding(other.id, null)
    }
    setBinding(command.id, pending.binding)
    setPending(null)
  }

  return (
    <div className="grid gap-3 px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-medium">{command.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {command.description}
            {command.scope !== "global"
              ? ` · ${SCOPES[command.scope].label}`
              : null}
          </span>
        </div>
        <button
          type="button"
          onClick={
            recorder.isRecording ? recorder.cancelRecording : startRecording
          }
          className={cn(
            "flex h-8 min-w-28 items-center justify-center rounded-lg border px-2 text-xs transition-colors",
            recorder.isRecording
              ? "animate-pulse border-primary text-muted-foreground"
              : "hover:bg-muted"
          )}
          aria-label={`Change shortcut for ${command.title}`}
        >
          {recorder.isRecording ? (
            recorder.steps.length > 0 ? (
              <BindingKeys
                binding={
                  recorder.steps.length === 1
                    ? hotkey(recorder.steps[0])
                    : sequence(...recorder.steps)
                }
              />
            ) : (
              "Press keys…"
            )
          ) : binding ? (
            <BindingKeys binding={binding} />
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(!customized && "invisible")}
          onClick={() => resetBinding(command.id)}
          aria-label={`Reset shortcut for ${command.title}`}
        >
          <RotateCcwIcon />
        </Button>
      </div>

      {pending ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted px-3 py-2 text-xs">
          <span className="flex-1">
            <span className="font-medium">
              {formatBinding(pending.binding)}
            </span>{" "}
            is already used by{" "}
            {pending.conflicts.map((other) => other.title).join(", ")}.
          </span>
          <Button size="xs" variant="outline" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button size="xs" variant="outline" onClick={() => apply(false)}>
            Keep both
          </Button>
          <Button size="xs" onClick={() => apply(true)}>
            Replace
          </Button>
        </div>
      ) : null}
    </div>
  )
}
