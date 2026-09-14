import { useCommand } from "@/lib/commands"

/**
 * Binds the `createProject.submitStep` command (Mod+Enter by default) to the
 * current step's group submit. Lives in its own component because `FormGroup`
 * exposes its API through a render prop, where hooks cannot be called.
 */
export function StepSubmitHotkey({ onSubmit }: { onSubmit: () => void }) {
  useCommand("createProject.submitStep", onSubmit)
  return null
}
