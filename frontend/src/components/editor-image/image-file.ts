// An image added in the editor stays in the browser until the record or
// comment is saved: it goes into the text as a data: address, and the save
// stores it as a Frappe File on the record (setu.api.media.store_images),
// which puts the File's address in its place.

/** What the insert dialog accepts; the server checks the same. */
export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Why a file can't be added, before reading it; null when it can. */
export function imageFileProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Only PNG, JPG, GIF or WebP images can be added."
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Images can be up to 5 MB."
  }
  return null
}

/**
 * The image as a data: address that also carries its name and who can open
 * it once saved, which the server reads back:
 * `data:image/png;filename=shot.png;private=0;base64,…`
 */
export async function imageDataAddress(
  file: File,
  { isPrivate }: { isPrivate: boolean }
): Promise<string> {
  const plain = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const comma = plain.indexOf(",")
  // A safe name: no character that could end the parameter or the attribute.
  const filename = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100)
  return `data:${file.type};filename=${filename || "image"};private=${isPrivate ? 1 : 0};base64,${plain.slice(comma + 1)}`
}

/**
 * Turn any unsaved private `data:` images in editor HTML public (used when a
 * draft task gets the `github` tag or moves under a GitHub parent before save).
 */
export function makeDraftImagesPublic(html: string): string {
  if (!html || !html.includes(";private=1;")) return html
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*["']data:[^"']*?);private=1;/gi,
    "$1;private=0;"
  )
}
