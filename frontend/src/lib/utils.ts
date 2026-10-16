import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Mirrors the custom --text-* tokens in index.css; unregistered, tailwind-merge
// reads `text-compact` as a colour and drops it against `text-muted-foreground`.
// https://github.com/dcastil/tailwind-merge/blob/v3.6.0/docs/configuration.md#theme
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["avatar", "caption", "meta", "compact", "subtitle", "dialog"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
