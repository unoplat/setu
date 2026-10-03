"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { DragOverlay, type Modifier } from "@dnd-kit/core"
import { getEventCoordinates } from "@dnd-kit/utilities"
import { ArrowRight } from "lucide-react"
import type {
  AnyKanbanCardRenderer,
  KanbanItem,
  KanbanRenderContext,
} from "../types"
import { ItemRenderer } from "./item-renderer"

/**
 * Envision: hangs a compact preview just below and right of the pointer, the
 * way a tooltip sits, instead of where the card was grabbed. Everything above
 * and left of the pointer, the headers that name the drop target included,
 * stays readable. A keyboard drag has no pointer and is left where it is.
 */
const belowPointer: Modifier = ({
  transform,
  activatorEvent,
  draggingNodeRect,
}) => {
  const pointer = activatorEvent ? getEventCoordinates(activatorEvent) : null
  if (!pointer || !draggingNodeRect) return transform
  return {
    ...transform,
    x: transform.x + pointer.x - draggingNodeRect.left + 12,
    y: transform.y + pointer.y - draggingNodeRect.top + 16,
  }
}

const COMPACT_MODIFIERS = [belowPointer]
// The overlay is sized like the dragged card unless told otherwise.
const COMPACT_STYLE = { width: "auto", height: "auto" }

export function KanbanDragOverlay({
  activeItem,
  rendererMap,
  renderPreview,
  destination,
}: {
  activeItem: KanbanItem | null
  rendererMap: Map<string, AnyKanbanCardRenderer>
  /** Envision: a compact stand-in for the card (`renderDragPreview`). */
  renderPreview?: (item: KanbanItem) => ReactNode
  /** Envision: where the card would land, e.g. "Blocked · Payments"; absent over its own cell. */
  destination?: string
}) {
  // Portal the overlay into <body> so a transformed ancestor above the board
  // can't become the containing block for dnd-kit's `position: fixed` overlay
  // and offset the drag ghost from the pointer. (`transform`, `filter`,
  // `perspective`, `will-change: transform`, and `contain: paint` all create a
  // containing block — entrance-animation wrappers are the common culprit.)
  // React context flows through portals, so the overlay stays bound to
  // DndContext. Gate on a client-mount flag so SSR / pre-hydration renders
  // nothing (document is absent on the server). `useSyncExternalStore` with a
  // `false` server snapshot is the repo's SSR-safe client-detect primitive —
  // it avoids the React-19 set-state-in-effect antipattern.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const overlay = (
    <DragOverlay
      dropAnimation={null}
      modifiers={renderPreview ? COMPACT_MODIFIERS : undefined}
      style={renderPreview ? COMPACT_STYLE : undefined}
    >
      {activeItem ? (
        <div className="flex w-fit cursor-grabbing flex-col items-start gap-1.5">
          {renderPreview ? (
            renderPreview(activeItem)
          ) : (
            // Envision: upright. A tilted card reads as detached from the pointer.
            <div className="w-80 rounded-md shadow-2xl ring-2 ring-ring/40">
              <ItemRenderer
                item={activeItem}
                rendererMap={rendererMap}
                ctx={
                  {
                    itemId: activeItem.id,
                    columnId: "",
                    swimlaneId: activeItem.swimlaneId,
                    isDragging: true,
                    isLocked: activeItem.locked === true,
                  } satisfies KanbanRenderContext
                }
              />
            </div>
          )}
          {destination ? (
            <div className="flex items-center gap-1.5 rounded-full bg-sidebar-primary py-1 ps-2 pe-2.5 text-xs leading-4 font-semibold text-sidebar-primary-foreground shadow-lg">
              <ArrowRight aria-hidden="true" className="size-3.5" />
              {destination}
            </div>
          ) : null}
        </div>
      ) : null}
    </DragOverlay>
  )

  if (!mounted) return null
  return createPortal(overlay, document.body)
}
