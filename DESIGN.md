---
name: Envision
description: A precise, low-noise operations interface for SaaS project work.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.141 0.005 285.823)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.141 0.005 285.823)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.141 0.005 285.823)"
  primary: "oklch(0.488 0.243 264.376)"
  primary-foreground: "oklch(0.97 0.014 254.604)"
  secondary: "oklch(0.967 0.001 286.375)"
  secondary-foreground: "oklch(0.21 0.006 285.885)"
  muted: "oklch(0.967 0.001 286.375)"
  muted-foreground: "oklch(0.552 0.016 285.938)"
  accent: "oklch(0.967 0.001 286.375)"
  accent-foreground: "oklch(0.21 0.006 285.885)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.92 0.004 286.32)"
  input: "oklch(0.92 0.004 286.32)"
  ring: "oklch(0.705 0.015 286.067)"
  chart-1: "oklch(0.828 0.111 230.318)"
  chart-2: "oklch(0.685 0.169 237.323)"
  chart-3: "oklch(0.588 0.158 241.966)"
  chart-4: "oklch(0.5 0.134 242.749)"
  chart-5: "oklch(0.443 0.11 240.79)"
  sidebar: "oklch(0.985 0 0)"
  sidebar-foreground: "oklch(0.141 0.005 285.823)"
  sidebar-primary: "oklch(0.546 0.245 262.881)"
  sidebar-primary-foreground: "oklch(0.97 0.014 254.604)"
  sidebar-accent: "oklch(0.967 0.001 286.375)"
  sidebar-accent-foreground: "oklch(0.21 0.006 285.885)"
  sidebar-border: "oklch(0.92 0.004 286.32)"
  sidebar-ring: "oklch(0.705 0.015 286.067)"
  dark-background: "oklch(0.141 0.005 285.823)"
  dark-foreground: "oklch(0.985 0 0)"
  dark-card: "oklch(0.21 0.006 285.885)"
  dark-card-foreground: "oklch(0.985 0 0)"
  dark-popover: "oklch(0.21 0.006 285.885)"
  dark-popover-foreground: "oklch(0.985 0 0)"
  dark-primary: "oklch(0.424 0.199 265.638)"
  dark-primary-foreground: "oklch(0.97 0.014 254.604)"
  dark-secondary: "oklch(0.274 0.006 286.033)"
  dark-secondary-foreground: "oklch(0.985 0 0)"
  dark-muted: "oklch(0.274 0.006 286.033)"
  dark-muted-foreground: "oklch(0.705 0.015 286.067)"
  dark-accent: "oklch(0.274 0.006 286.033)"
  dark-accent-foreground: "oklch(0.985 0 0)"
  dark-destructive: "oklch(0.704 0.191 22.216)"
  dark-border: "oklch(1 0 0 / 10%)"
  dark-input: "oklch(1 0 0 / 15%)"
  dark-ring: "oklch(0.552 0.016 285.938)"
  dark-sidebar: "oklch(0.21 0.006 285.885)"
  dark-sidebar-foreground: "oklch(0.985 0 0)"
  dark-sidebar-primary: "oklch(0.623 0.214 259.815)"
  dark-sidebar-primary-foreground: "oklch(0.97 0.014 254.604)"
  dark-sidebar-accent: "oklch(0.274 0.006 286.033)"
  dark-sidebar-accent-foreground: "oklch(0.985 0 0)"
  dark-sidebar-border: "oklch(1 0 0 / 10%)"
  dark-sidebar-ring: "oklch(0.552 0.016 285.938)"
typography:
  display:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.111
    letterSpacing: "-0.0167em"
  headline:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.0133em"
  title:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "-0.0083em"
  body:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  body-small:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
    letterSpacing: "0em"
  button:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.429
    letterSpacing: "0em"
  label:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
    letterSpacing: "0em"
  caption:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
  metric:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.143
    letterSpacing: "-0.0071em"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  3xl: "1.375rem"
  4xl: "1.625rem"
  full: "9999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
  10: "2.5rem"
  12: "3rem"
  16: "4rem"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.4xl}"
    padding: "0 0.75rem"
    height: "2.25rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.4xl}"
    padding: "0 0.75rem"
    height: "2.25rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.4xl}"
    padding: "0 0.75rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.4xl}"
    padding: "0 0.75rem"
    height: "2.25rem"
  button-destructive:
    backgroundColor: "oklch(0.577 0.245 27.325 / 10%)"
    textColor: "{colors.destructive}"
    typography: "{typography.button}"
    rounded: "{rounded.4xl}"
    padding: "0 0.75rem"
    height: "2.25rem"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.4xl}"
    padding: "0 0.75rem"
    height: "2.25rem"
---

# Design System: Envision

## Overview

**Creative North Star: "The Calm Operations Desk"**

Envision is a restrained shadcn-style interface built from the semantic Tailwind v4 theme in `frontend/src/index.css`. Neutral zinc surfaces carry most of the interface. A concentrated blue marks action and selection, while borders and state changes provide structure without visual noise.

Light and dark themes use the same semantic roles. Components bind to those roles rather than fixed light-mode values, so project information remains legible in either theme.

**Key Characteristics:**
- Semantic light and dark color roles authored in OKLCH.
- Inter Variable throughout the product.
- A 4px spacing foundation and a computed 6–26px radius scale.
- Zinc surfaces and borders before shadows.
- Blue reserved for primary action, active navigation, and meaningful emphasis.

## Colors

The palette combines neutral zinc surfaces, a cobalt primary, a cyan-blue chart sequence, and one destructive red.

### Primary
- **Signal Blue:** Primary actions, selected navigation, focus-adjacent emphasis, and important data. The chart family moves from light cyan to deep blue for ordered series.

### Secondary
- **Quiet Zinc:** Secondary controls, muted regions, hover states, and low-emphasis grouping.

### Tertiary
- **Alert Red:** Destructive actions, invalid states, and genuine risk. The button uses a translucent red surface with red text rather than a solid danger fill.

### Neutral
- **Canvas White:** Main light-mode page, card, and popover ground.
- **Zinc Ink:** Primary text and high-contrast icons.
- **Soft Zinc:** Secondary surfaces, muted areas, and hover feedback.
- **Middle Zinc:** Metadata, placeholders, and focus rings.
- **Hairline Zinc:** Borders, dividers, and field outlines.
- **Night Zinc:** Dark canvas with lifted zinc cards and translucent white borders.

### Named Rules

**The Blue Signal Rule.** Blue marks a meaningful action, selected location, or emphasized datum. It is not ambient decoration.

**The Semantic Pairing Rule.** Every surface uses its matching foreground role, including cards, popovers, sidebars, controls, and their dark equivalents.

**The Source Rule.** `frontend/src/index.css` is the normative color and radius source. Keep this document and Paper tokens aligned when that file changes.

## Typography

**Display Font:** Inter Variable with a sans-serif fallback

**Body Font:** Inter Variable with a sans-serif fallback

**Label Font:** Inter Variable

**Character:** Neutral, compact, and highly legible. Weight and scale create hierarchy without changing typefaces.

### Hierarchy
- **Display** (700, 36px, 40px): Rare top-level statements and major empty states.
- **Headline** (700, 30px, 36px): Primary page headings.
- **Title** (600, 24px, 32px): Section and panel titles.
- **Body** (400, 16px, 24px): Core reading and important control text.
- **Body Small** (400, 14px, 20px): Task cards, navigation, and dense application content.
- **Button** (500, 14px, 20px): Implemented button labels.
- **Label** (500–600, 12px, 16px): Metadata, badges, summaries, and field labels.
- **Caption** (400, 10px, 14px): Timestamps and tertiary metadata only.
- **Metric** (700, 28px, 32px): Compact numeric summaries.

### Named Rules

**The Single-Family Rule.** Use Inter Variable for every role. Size and weight carry hierarchy.

**The Tightening Rule.** Keep tracking neutral through 18px, then tighten it gradually for larger roles.

## Layout

Envision uses Tailwind's 4px spacing base with practical steps at 8, 12, 16, 20, 24, 32, 40, 48, and 64px. App shells pair a quiet sidebar with a brighter content canvas. Borders or semantic background changes separate major regions.

Keep one stable reading order: page context and actions, view controls, then the work area. On narrow screens, collapse secondary navigation before compressing task content. A Kanban work area may scroll horizontally when that preserves column meaning better than squeezing the board.

## Elevation & Depth

The current frontend theme does not define custom shadow tokens. Use tonal layering and the semantic border by default. Add a Tailwind shadow only for transient UI that must float, such as menus, popovers, and dialogs.

### Named Rules

**The Border-First Rule.** If a border or tonal shift explains the layer, do not add a shadow.

## Shapes

The base radius is 10px. Tailwind derives compact 6px and 8px steps, a 10px default, then 14px, 18px, 22px, and 26px steps for progressively larger or more pill-like controls. The implemented button uses the 26px step. Full pills remain appropriate for compact badges and avatars.

Borders are one pixel by default. Focus and invalid states use a three-pixel ring with transparent semantic color.

**The Radius-by-Component Rule.** Use the exact radius token chosen by the component implementation. Do not substitute the older 12px-control and 14px-card convention.

## Components

### Buttons
- **Shape:** The implemented button uses the 26px radius step. Default height is 36px with 12px horizontal padding; sizes run 24px, 32px, 36px, and 40px.
- **Primary:** Signal Blue surface with pale-blue text. Hover reduces the primary color to 80% opacity.
- **Secondary:** Quiet Zinc surface with zinc foreground. Hover mixes 5% foreground into the surface.
- **Outline:** Semantic background with a one-pixel border. Hover moves to the muted surface. Dark mode starts transparent.
- **Ghost:** Transparent at rest and muted on hover.
- **Destructive:** Translucent destructive background with destructive text. Increase the tint on hover rather than switching to a solid red fill.
- **Link:** Primary text with an underline on hover.
- **Interaction:** Active non-popup buttons move down by one pixel. Focus uses a semantic border and three-pixel ring. Disabled buttons block pointer events and use 50% opacity.
- **Icons:** Default icon size is 16px; extra-small buttons use 12px icons. Icons do not receive pointer events.

## Do's and Don'ts

### Do:
- **Do** bind component colors to semantic Tailwind tokens so light and dark themes stay synchronized.
- **Do** preserve the 4px spacing base and the computed radius scale from `--radius: 0.625rem`.
- **Do** reserve blue for action, selection, focus-adjacent emphasis, and ordered chart data.
- **Do** use zinc surfaces and borders before adding elevation.
- **Do** match implemented component sizes and states before documenting new variants.

### Don't:
- **Don't** reintroduce the previous stone palette; the frontend uses zinc neutrals.
- **Don't** describe buttons as 12px-radius, 40px controls by default; the implementation is 26px and 36px.
- **Don't** hard-code light colors into components that support dark mode.
- **Don't** use Alert Red for ordinary priority or decoration.
- **Don't** document components as implemented until they exist in `frontend/`.
