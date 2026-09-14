import { detectPlatform, formatForDisplay } from "@tanstack/react-hotkeys"

import type { Binding } from "./registry"

/**
 * Platform-aware text for a binding: "⌘⇧E" on macOS, "Ctrl+Shift+E" on
 * Windows and Linux, "G then P" for sequences. Uses TanStack's formatter so
 * symbols and labels stay consistent with the recorder and devtools.
 */
export function formatBinding(binding: Binding | null): string {
  if (!binding) return ""
  if (binding.kind === "sequence") {
    return binding.keys.map((key) => formatForDisplay(key)).join(" then ")
  }
  const platform = detectPlatform()
  return formatForDisplay(binding.hotkey, {
    platform,
    separatorToken: platform === "mac" ? "" : "+",
  })
}

/** Individual keycap labels for a chord, in display order. */
export function chordTokens(hotkey: Binding & { kind: "hotkey" }): string[] {
  const platform = detectPlatform()
  const text = formatForDisplay(hotkey.hotkey, { platform })
  return platform === "mac" ? text.split(" ") : text.split("+")
}
