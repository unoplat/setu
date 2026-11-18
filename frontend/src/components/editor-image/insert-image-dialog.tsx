import * as React from "react"
import type { Editor } from "@tiptap/react"
import { GlobeIcon, LockIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { IMAGE_TYPES, imageDataAddress, imageFileProblem } from "./image-file"

// Paper: upload-image-editor, frames 01, 02 and 05. One dialog for both ways
// in: Upload first, Link one tab away. Images are public by default, shown
// before one is added, with a Private switch to keep one inside Envision.
// Nothing is sent from here: the image goes into the text, and the save of
// the record or comment stores it (image-file.ts). A file that can't be read
// is a toast and the dialog stays open.

type Tab = "upload" | "link"

export function InsertImageDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* The mark the package's popups carry, so the expanded editor
            leaves Escape to this dialog (record-detail.tsx). On an empty
            element: on the dialog it would swap the app's colour tokens for
            the package's (index.css). */}
        <span data-richtext-portal="" hidden />
        {/* Remounted on each open, so every insert starts from the defaults. */}
        {open ? (
          <InsertImageForm editor={editor} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function InsertImageForm({
  editor,
  onDone,
}: {
  editor: Editor
  onDone: () => void
}) {
  const [tab, setTab] = React.useState<Tab>("upload")
  const [isPrivate, setIsPrivate] = React.useState(false)
  const [alt, setAlt] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [reading, setReading] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const altId = React.useId()
  const urlId = React.useId()

  function insert(src: string) {
    editor
      .chain()
      .focus()
      .setImageInline({ src, alt: alt.trim() || undefined, inline: false })
      .run()
    onDone()
  }

  async function addFile(file: File | undefined) {
    if (!file || reading) return
    const problem = imageFileProblem(file)
    if (problem) {
      toast.error(`${file.name} wasn't added`, { description: problem })
      return
    }
    setReading(true)
    try {
      insert(await imageDataAddress(file, { isPrivate }))
    } catch {
      toast.error(`${file.name} wasn't added`, {
        description: "It couldn't be read. Try again, or add it by link.",
      })
      setReading(false)
    }
  }

  return (
    <div
      className="grid gap-5"
      // A screenshot pasted anywhere in the dialog is added, as in the drop zone.
      onPaste={(event) => {
        if (tab !== "upload") return
        const file = Array.from(event.clipboardData.files).find((item) =>
          item.type.startsWith("image/")
        )
        if (file) {
          event.preventDefault()
          void addFile(file)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Insert image</DialogTitle>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="w-full">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="link">Link</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div className="grid gap-4 pt-2">
            <button
              type="button"
              disabled={reading}
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void addFile(event.dataTransfer.files[0])
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-muted/40 px-5 py-8 text-center transition-colors outline-none hover:bg-muted/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none",
                dragging && "border-ring bg-muted/70"
              )}
            >
              <UploadIcon className="size-5 text-muted-foreground" />
              <span className="text-sm">
                Drop an image, paste, or{" "}
                <span className="font-medium text-primary">choose a file</span>
              </span>
              <span className="text-xs text-muted-foreground">
                PNG, JPG, GIF or WebP · up to 5 MB
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                void addFile(file)
              }}
            />
            <VisibilityNotice
              isPrivate={isPrivate}
              onPrivateChange={setIsPrivate}
              disabled={reading}
            />
          </div>
        </TabsContent>

        <TabsContent value="link">
          <form
            className="grid gap-2 pt-2"
            onSubmit={(event) => {
              event.preventDefault()
              // Keep the editor's form (Create Project) from submitting.
              event.stopPropagation()
              if (url.trim()) insert(url.trim())
            }}
          >
            <Label htmlFor={urlId}>Image address</Label>
            <div className="flex gap-2">
              <Input
                id={urlId}
                type="url"
                required
                placeholder="https://"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button type="submit">Insert</Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>

      <div className="grid gap-2">
        <Label htmlFor={altId}>
          Alt text
          <span className="font-normal text-muted-foreground">· optional</span>
        </Label>
        <Input
          id={altId}
          placeholder="Describe the image for screen readers"
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
        />
      </div>
    </div>
  )
}

function VisibilityNotice({
  isPrivate,
  onPrivateChange,
  disabled,
}: {
  isPrivate: boolean
  onPrivateChange: (value: boolean) => void
  disabled: boolean
}) {
  const switchId = React.useId()
  const Icon = isPrivate ? LockIcon : GlobeIcon
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted px-3.5 py-3">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid flex-1 gap-0.5" aria-live="polite">
        <span className="text-sm font-semibold">
          {isPrivate
            ? "Only people who can open this"
            : "Anyone with the link can view"}
        </span>
        <span className="text-xs text-muted-foreground">
          {isPrivate
            ? "Will be visible only in Envision."
            : "Will also be visible outside Envision, such as on GitHub."}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Label htmlFor={switchId}>Private</Label>
        <Switch
          id={switchId}
          size="sm"
          checked={isPrivate}
          onCheckedChange={onPrivateChange}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
