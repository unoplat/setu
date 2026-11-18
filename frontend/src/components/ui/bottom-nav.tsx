import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"

/*
 * A phone's bottom navigation bar: a few top-level destinations, each an icon
 * over a one-line label, fixed to the bottom of the viewport.
 *
 * - Route navigation, so a <nav> with a list of links, never role="tablist".
 *   A destination that opens something (search) renders as a button.
 * - Solid surface with a hairline top border, no shadow. It sits below the
 *   z-50 overlays (dialogs, sheets), which cover it while they are open.
 * - Pads itself clear of the home indicator and landscape notches. The safe
 *   area insets need `viewport-fit=cover` in the page's viewport meta.
 * - Visibility is the caller's: e.g. `md:hidden` to keep it to phones.
 */

function BottomNav({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="bottom-nav"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]",
        className
      )}
      {...props}
    />
  )
}

function BottomNavList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="bottom-nav-list"
      className={cn("grid h-16 auto-cols-fr grid-flow-col", className)}
      {...props}
    />
  )
}

function BottomNavItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="bottom-nav-item"
      className={cn("flex min-w-0", className)}
      {...props}
    />
  )
}

/**
 * The whole cell is the hit target. Renders a <button> by default; pass a
 * router link through `render` for a destination. Active (`isActive`, or a
 * link's own `aria-current="page"`) wears the selection colour.
 */
function BottomNavButton({
  render,
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"button"> & { isActive?: boolean }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "relative flex flex-1 touch-manipulation flex-col items-center justify-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none not-data-active:not-aria-[current=page]:hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset aria-[current=page]:text-sidebar-primary data-active:text-sidebar-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[22px]",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "bottom-nav-button",
      active: isActive,
    },
  })
}

/**
 * A count or dot at the top end of the item's icon. Mirrors in RTL.
 */
function BottomNavBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="bottom-nav-badge"
      className={cn(
        "pointer-events-none absolute start-1/2 top-1.5 ms-1.5 flex",
        className
      )}
      {...props}
    />
  )
}

export {
  BottomNav,
  BottomNavList,
  BottomNavItem,
  BottomNavButton,
  BottomNavBadge,
}
