import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore"

import {
  imageDataAddress,
  imageFileProblem,
} from "@/components/editor-image/image-file"

// Excalidraw drawings are saved as normal PNG images with the native scene
// embedded in the PNG metadata (`exportEmbedScene: true`). The `excalidraw-`
// filename prefix is the sole marker that survives unsaved `data:` URIs,
// Frappe's File storage (including hash suffixes), and GitHub round trips.

const EXCALIDRAW_PREFIX = "excalidraw-"
const PNG_EXTENSION = ".png"
const FILENAME_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
const FILENAME_RANDOM_LENGTH = 10

const FIXED_EXPORT_PADDING = 16
const FIXED_EXPORT_APP_STATE = {
  exportEmbedScene: true,
  exportBackground: true,
  viewBackgroundColor: "#ffffff",
  exportWithDarkMode: false,
  exportScale: 2,
} as const

export class ExcalidrawExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExcalidrawExportError"
  }
}

/** Point Excalidraw at local bundled fonts under the app's configured base URL. */
export function ensureExcalidrawAssetPath(): void {
  if (typeof window === "undefined") return
  const target = window as Window & { EXCALIDRAW_ASSET_PATH?: string }
  if (!target.EXCALIDRAW_ASSET_PATH) {
    const base = import.meta.env.BASE_URL || "/"
    target.EXCALIDRAW_ASSET_PATH = `${base.endsWith("/") ? base : `${base}/`}excalidraw-assets/`
  }
}

/**
 * Generate a unique `excalidraw-<random>.png` filename on every export so
 * Frappe never reuses a swept filename and GitHub's URL cache never serves a
 * stale drawing.
 */
export function createExcalidrawFilename(): string {
  const bytes = new Uint8Array(FILENAME_RANDOM_LENGTH)
  crypto.getRandomValues(bytes)
  let suffix = ""
  for (const byte of bytes) {
    suffix += FILENAME_ALPHABET[byte % FILENAME_ALPHABET.length]
  }
  return `${EXCALIDRAW_PREFIX}${suffix}${PNG_EXTENSION}`
}

function parseDataUriParams(src: string): Map<string, string> | null {
  if (!src.toLowerCase().startsWith("data:")) return null
  const comma = src.indexOf(",")
  if (comma === -1) return null
  const header = src.slice(5, comma)
  const params = new Map<string, string>()
  for (const part of header.split(";").slice(1)) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const value = part.slice(eq + 1).trim()
    params.set(key, value)
  }
  return params
}

function parseUrl(src: string): URL | null {
  try {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost"
    return new URL(src, origin)
  } catch {
    return null
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isSiteFilePath(pathname: string): boolean {
  return (
    pathname.startsWith("/files/") || pathname.startsWith("/private/files/")
  )
}

function hasExcalidrawFilename(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.startsWith(EXCALIDRAW_PREFIX) && lower.endsWith(PNG_EXTENSION)
}

/**
 * Single-marker detection: returns true when `src` looks like an Envision
 * Excalidraw drawing based solely on its `excalidraw-*.png` filename.
 */
export function isExcalidrawImageSrc(src: string): boolean {
  if (!src) return false
  const dataParams = parseDataUriParams(src)
  if (dataParams) {
    const filename = dataParams.get("filename")
    if (!filename) return false
    return hasExcalidrawFilename(safeDecode(filename))
  }
  const url = parseUrl(src)
  if (!url || !isSiteFilePath(url.pathname)) return false
  const basename = url.pathname.slice(url.pathname.lastIndexOf("/") + 1)
  return hasExcalidrawFilename(safeDecode(basename))
}

/** Whether an existing drawing `src` is currently marked private. */
export function isPrivateExcalidrawSrc(src: string): boolean {
  const dataParams = parseDataUriParams(src)
  if (dataParams) {
    const priv = dataParams.get("private")
    return priv !== undefined && priv !== "0"
  }
  const url = parseUrl(src)
  return Boolean(url && url.pathname.startsWith("/private/files/"))
}

/**
 * Strict same-origin fetch path: only `/files/...` or `/private/files/...`
 * relative to the current origin is ever fetched, never an arbitrary host.
 */
export function resolveSameOriginExcalidrawUrl(src: string): string | null {
  const url = parseUrl(src)
  if (!url || !isSiteFilePath(url.pathname)) return null
  return `${url.pathname}${url.search}`
}

function decodeDataUriToBlob(src: string): Blob | null {
  const comma = src.indexOf(",")
  if (comma === -1) return null
  const header = src.slice(5, comma)
  const parts = header.split(";").map((part) => part.trim())
  const mimeType = parts[0]?.toLowerCase() || "image/png"
  if (!parts.slice(1).some((part) => part.toLowerCase() === "base64")) {
    return null
  }
  try {
    const binary = atob(src.slice(comma + 1).replace(/\s+/g, ""))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: mimeType })
  } catch {
    return null
  }
}

/**
 * Load an embedded Excalidraw scene from an unsaved `data:` URI or a saved
 * same-origin `/files/` or `/private/files/` PNG. Throws if fetching fails or
 * the PNG does not carry a readable Excalidraw scene.
 */
export async function loadExcalidrawScene(
  src: string
): Promise<RestoredDataState> {
  let blob: Blob
  if (src.toLowerCase().startsWith("data:")) {
    const decoded = decodeDataUriToBlob(src)
    if (!decoded) {
      throw new Error("Could not decode drawing data.")
    }
    blob = decoded
  } else {
    const relativeUrl = resolveSameOriginExcalidrawUrl(src)
    if (!relativeUrl) {
      throw new Error("Drawing is not hosted on this site.")
    }
    const response = await fetch(relativeUrl, { credentials: "same-origin" })
    if (!response.ok) {
      throw new Error(`Could not fetch drawing (${response.status}).`)
    }
    blob = await response.blob()
  }

  ensureExcalidrawAssetPath()
  const { loadFromBlob } = await import("@excalidraw/excalidraw")
  const scene = await loadFromBlob(blob, null, null)
  const hasVisibleElements =
    Array.isArray(scene.elements) &&
    scene.elements.some((element) => !element.isDeleted)
  if (!hasVisibleElements) {
    throw new Error("Drawing has no editable elements.")
  }
  return scene
}

/**
 * Export the current Excalidraw scene to an embedded-scene PNG `data:` URI
 * ready for the image pipeline, using fixed light/white 2x export settings.
 */
export async function exportExcalidrawDataAddress(
  api: ExcalidrawImperativeAPI,
  { isPrivate }: { isPrivate: boolean }
): Promise<string> {
  const elements = api.getSceneElements()
  if (!elements.length) {
    throw new ExcalidrawExportError("Draw something before saving.")
  }

  ensureExcalidrawAssetPath()
  const { exportToBlob } = await import("@excalidraw/excalidraw")
  const blob = await exportToBlob({
    elements,
    files: api.getFiles(),
    mimeType: "image/png",
    exportPadding: FIXED_EXPORT_PADDING,
    appState: { ...FIXED_EXPORT_APP_STATE },
  })

  const file = new File([blob], createExcalidrawFilename(), {
    type: "image/png",
  })
  const problem = imageFileProblem(file)
  if (problem) {
    throw new ExcalidrawExportError(problem)
  }

  return imageDataAddress(file, { isPrivate })
}
