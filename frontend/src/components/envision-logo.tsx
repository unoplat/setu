import { cn } from "@/lib/utils"

/**
 * The Envision app mark: a Veena on a tile. Follows the theme: a light tile
 * with dark lines in light mode, a dark tile with light lines in dark mode
 * (colors: --brand-* in index.css). The dark variant matches
 * `setu/public/images/envision.svg` (favicon and desktop icon); keep the
 * shapes in sync.
 */
export function EnvisionLogo({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Envision"
      className={cn("shrink-0", className)}
      {...props}
    >
      <rect width="64" height="64" rx="14" className="fill-brand-tile" />
      <g
        transform="translate(12.6 11.4) scale(1.6667)"
        fill="none"
        className="stroke-brand-mark"
        strokeWidth="2.25"
        strokeLinecap="round"
      >
        <circle cx="8" cy="16" r="4.5" />
        <path d="M11.2 12.8 17.5 6.5M13 8.5l2.5 2.5" />
        <circle cx="19" cy="5" r="1.75" />
        <circle
          cx="8"
          cy="16"
          r="1.5"
          className="fill-brand-accent"
          stroke="none"
        />
      </g>
    </svg>
  )
}
