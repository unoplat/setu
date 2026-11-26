import { Excalidraw } from "@excalidraw/excalidraw"
import "@excalidraw/excalidraw/index.css"
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  UIOptions,
} from "@excalidraw/excalidraw/types"
import * as React from "react"

import { ensureExcalidrawAssetPath } from "./excalidraw-file"

ensureExcalidrawAssetPath()

// Keep file/export/theme chrome out of Excalidraw's hamburger menu so the
// dialog's own Save button, fixed white-background export, and app theme stay
// the single source of truth.
const CANVAS_UI_OPTIONS: UIOptions = {
  canvasActions: {
    changeViewBackgroundColor: false,
    export: false,
    loadScene: false,
    saveAsImage: false,
    saveToActiveFile: false,
    toggleTheme: false,
  },
}

export default function ExcalidrawCanvas({
  initialData,
  theme,
  onApiReady,
}: {
  initialData: ExcalidrawInitialDataState | null
  theme: "light" | "dark"
  onApiReady: (api: ExcalidrawImperativeAPI) => void
}) {
  const latestOnApiReady = React.useRef(onApiReady)
  React.useEffect(() => {
    latestOnApiReady.current = onApiReady
  })

  const handleApi = React.useCallback((api: ExcalidrawImperativeAPI) => {
    latestOnApiReady.current(api)
    // Re-measure after the dialog's open animation settles so pointer
    // coordinates align accurately with the canvas.
    window.setTimeout(() => {
      api.refresh()
    }, 150)
  }, [])

  return (
    <div className="h-full w-full">
      <Excalidraw
        theme={theme}
        initialData={initialData}
        excalidrawAPI={handleApi}
        UIOptions={CANVAS_UI_OPTIONS}
      />
    </div>
  )
}
