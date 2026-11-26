import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore"
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"
import type { Editor } from "@tiptap/react"
import { GlobeIcon, LockIcon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { CreateDialogContent } from "@/components/app-ui/editor-panel"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"

import {
  ExcalidrawExportError,
  exportExcalidrawDataAddress,
  isPrivateExcalidrawSrc,
  loadExcalidrawScene,
} from "./excalidraw-file"
import {
  type ExcalidrawEditTarget,
  registerExcalidrawDialog,
} from "./open-excalidraw-dialog"

const LazyExcalidrawCanvas = React.lazy(() => import("./excalidraw-canvas"))

interface DialogSession {
  key: number
  editTarget: ExcalidrawEditTarget | null
  initialData: ExcalidrawInitialDataState | null
  initialPrivate: boolean
}

function updateImageNodeSrc(
  editor: Editor,
  target: ExcalidrawEditTarget,
  nextSrc: string
): boolean {
  const { doc, tr } = editor.state
  let nodePos: number | null = null
  const atSavedPos = doc.nodeAt(target.pos)
  if (
    atSavedPos &&
    (atSavedPos.type.name === "image" ||
      atSavedPos.type.name === "imageBlock") &&
    atSavedPos.attrs.src === target.src
  ) {
    nodePos = target.pos
  } else {
    doc.descendants((node, pos) => {
      if (
        (node.type.name === "image" || node.type.name === "imageBlock") &&
        node.attrs.src === target.src
      ) {
        nodePos = pos
        return false
      }
      return true
    })
  }

  if (nodePos === null) return false
  const node = doc.nodeAt(nodePos)
  if (!node) return false

  editor.view.dispatch(
    tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, src: nextSrc })
  )
  editor.commands.focus()
  return true
}

/**
 * The Excalidraw modal of one editor, mounted once beside it. The toolbar
 * button, "/excalidraw", and the selected-image bubble open it through
 * `openExcalidrawDialog`.
 */
export function EditorExcalidrawDialog({
  editor,
  publicOnly = false,
}: {
  editor: Editor
  /** Disallow private uploads (e.g. GitHub-synced tasks and subtasks). */
  publicOnly?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [session, setSession] = React.useState<DialogSession | null>(null)
  const requestIdRef = React.useRef(0)
  const sessionKeyRef = React.useRef(0)

  const handleOpen = React.useCallback(
    (target?: ExcalidrawEditTarget) => {
      if (!editor.isEditable) return
      const requestId = ++requestIdRef.current

      if (!target) {
        sessionKeyRef.current += 1
        setSession({
          key: sessionKeyRef.current,
          editTarget: null,
          initialData: null,
          initialPrivate: false,
        })
        setOpen(true)
        return
      }

      void loadExcalidrawScene(target.src).then(
        (scene: RestoredDataState) => {
          if (requestIdRef.current !== requestId || editor.isDestroyed) return
          sessionKeyRef.current += 1
          setSession({
            key: sessionKeyRef.current,
            editTarget: target,
            initialData: {
              elements: scene.elements,
              files: scene.files,
              scrollToContent: true,
            },
            initialPrivate: publicOnly
              ? false
              : isPrivateExcalidrawSrc(target.src),
          })
          setOpen(true)
        },
        () => {
          if (requestIdRef.current !== requestId) return
          toast.error("This drawing can't be edited here.")
        }
      )
    },
    [editor, publicOnly]
  )

  React.useEffect(
    () => registerExcalidrawDialog(editor, handleOpen),
    [editor, handleOpen]
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          requestIdRef.current += 1
        }
        setOpen(nextOpen)
      }}
    >
      <CreateDialogContent expanded>
        {/* Keeps Escape inside this dialog instead of collapsing the expanded
            description editor (record-detail.tsx). Placed on a hidden empty
            element so the dialog keeps the app's own oklch colour tokens. */}
        <span data-richtext-portal="" hidden />
        {open && session ? (
          <ExcalidrawDialogBody
            key={session.key}
            editor={editor}
            session={session}
            publicOnly={publicOnly}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </CreateDialogContent>
    </Dialog>
  )
}

function ExcalidrawDialogBody({
  editor,
  session,
  publicOnly,
  onClose,
}: {
  editor: Editor
  session: DialogSession
  publicOnly: boolean
  onClose: () => void
}) {
  const { resolvedTheme } = useTheme()
  const [isPrivate, setIsPrivate] = React.useState(session.initialPrivate)
  const effectivePrivate = publicOnly ? false : isPrivate
  const [saving, setSaving] = React.useState(false)
  const apiRef = React.useRef<ExcalidrawImperativeAPI | null>(null)
  const switchId = React.useId()

  const handleApiReady = React.useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api
  }, [])

  async function handleSave() {
    const api = apiRef.current
    if (!api || saving) return
    setSaving(true)
    try {
      const nextSrc = await exportExcalidrawDataAddress(api, {
        isPrivate: effectivePrivate,
      })

      if (session.editTarget) {
        const updated = updateImageNodeSrc(editor, session.editTarget, nextSrc)
        if (!updated) {
          editor
            .chain()
            .focus()
            .setImageInline({
              src: nextSrc,
              alt: "Excalidraw diagram",
              inline: false,
            })
            .run()
        }
      } else {
        editor
          .chain()
          .focus()
          .setImageInline({
            src: nextSrc,
            alt: "Excalidraw diagram",
            inline: false,
          })
          .run()
      }
      onClose()
    } catch (error) {
      if (error instanceof ExcalidrawExportError) {
        toast.error("Drawing wasn't saved", { description: error.message })
      } else {
        toast.error("Drawing wasn't saved", {
          description: "Something went wrong while exporting the drawing.",
        })
      }
      setSaving(false)
    }
  }

  const VisibilityIcon = effectivePrivate ? LockIcon : GlobeIcon
  const isEditing = session.editTarget !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <DialogTitle>
          {isEditing ? "Edit Excalidraw drawing" : "New Excalidraw drawing"}
        </DialogTitle>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
            <VisibilityIcon
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="text-muted-foreground">
              {publicOnly
                ? "Public (required for GitHub sync)"
                : effectivePrivate
                  ? "Private to Envision"
                  : "Anyone with the link"}
            </span>
            {publicOnly ? null : (
              <div className="flex items-center gap-1.5 border-s border-border ps-2">
                <Label htmlFor={switchId}>Private</Label>
                <Switch
                  id={switchId}
                  size="sm"
                  checked={effectivePrivate}
                  onCheckedChange={setIsPrivate}
                  disabled={saving}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : isEditing ? (
                "Update drawing"
              ) : (
                "Insert drawing"
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <React.Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading Excalidraw…
            </div>
          }
        >
          <LazyExcalidrawCanvas
            initialData={session.initialData}
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            onApiReady={handleApiReady}
          />
        </React.Suspense>
      </div>
    </div>
  )
}
