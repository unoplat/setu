---
name: Setu
description: A precise, low-noise operations interface for SaaS project work.
colors:
  background: "#FFFFFF"
  foreground: "#0C0A09"
  card: "#FFFFFF"
  card-foreground: "#0C0A09"
  popover: "#FFFFFF"
  popover-foreground: "#0C0A09"
  primary: "#1447E6"
  primary-foreground: "#EFF6FF"
  secondary: "#F4F4F5"
  secondary-foreground: "#18181B"
  muted: "#F5F5F4"
  muted-foreground: "#79716B"
  accent: "#F5F5F4"
  accent-foreground: "#1C1917"
  destructive: "#E7000B"
  border: "#E7E5E4"
  input: "#E7E5E4"
  ring: "#A6A09B"
  sidebar: "#FAFAF9"
  sidebar-foreground: "#0C0A09"
  sidebar-primary: "#155DFC"
  sidebar-primary-foreground: "#EFF6FF"
  sidebar-accent: "#F5F5F4"
  sidebar-accent-foreground: "#1C1917"
  sidebar-border: "#E7E5E4"
  sidebar-ring: "#A6A09B"
  chart-1: "#8EC5FF"
  chart-2: "#2B7FFF"
  chart-3: "#155DFC"
  chart-4: "#1447E6"
  chart-5: "#193CB8"
  dark-background: "#0C0A09"
  dark-foreground: "#FAFAF9"
  dark-card: "#1C1917"
  dark-card-foreground: "#FAFAF9"
  dark-primary: "#193CB8"
  dark-secondary: "#27272A"
  dark-secondary-foreground: "#FAFAFA"
  dark-muted: "#292524"
  dark-muted-foreground: "#A6A09B"
  dark-destructive: "#FF6467"
  dark-border: "#FFFFFF1A"
  dark-input: "#FFFFFF26"
  dark-ring: "#79716B"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.111
    letterSpacing: "-0.6px"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.4px"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "-0.2px"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0px"
  body-small:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.429
    letterSpacing: "0px"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.333
    letterSpacing: "0px"
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0px"
  metric:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.143
    letterSpacing: "-0.2px"
rounded:
  sm: "10px"
  md: "12px"
  lg: "14px"
  xl: "18px"
  2xl: "22px"
  3xl: "26px"
  4xl: "30px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
  16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body-small}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.body-small}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-small}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.background}"
    typography: "{typography.body-small}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
    width: "272px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-small}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "40px"
    width: "260px"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
    height: "20px"
---

# Design System: Setu

## Overview

**Creative North Star: "The Calm Operations Desk"**

Setu uses the incumbent Penpot system as its visual authority: a restrained shadcn-style interface built from semantic tokens, neutral surfaces, a focused blue signal color, and generous but controlled rounding. It is designed for sustained operational use rather than decorative spectacle. Hierarchy comes from spacing, typography, borders, and selective emphasis.

The system supports matched light and dark modes. Components must bind to semantic roles rather than hard-coded theme colors so each mode remains coherent. Dense project information should still feel breathable, predictable, and direct.

**Key Characteristics:**
- Semantic light and dark color roles.
- Inter throughout, with tighter tracking only on larger headings.
- A 4px spacing foundation and 10–30px radius scale.
- Borders and tonal layering before shadows.
- Blue reserved for primary actions, active navigation, and meaningful state.

## Colors

The palette pairs warm-neutral surfaces with a concentrated cobalt-blue action scale and a single explicit destructive red.

### Primary
- **Signal Blue:** The primary action, selected-navigation, focus-adjacent, and emphasized data color. Use its five-step chart family when several related series require ordered intensity.

### Secondary
- **Quiet Zinc:** Secondary controls and low-emphasis containers that need separation without competing with the main action.

### Neutral
- **Canvas White:** Main light-mode page and card surfaces.
- **Ink:** Primary text and high-contrast icons.
- **Soft Stone:** Muted surfaces, hover-ready regions, and quiet grouping.
- **Warm Gray:** Secondary text, metadata, and placeholders.
- **Hairline Stone:** Borders, dividers, and field outlines.
- **Night Ink:** Dark-mode page ground with lifted brown-black cards and translucent borders.

### Tertiary
- **Alert Red:** Destructive actions and high-risk state only; never use it for ordinary priority or decoration.

### Named Rules

**The Blue Signal Rule.** Blue marks a meaningful action, selected location, focus, or emphasized datum; it is not ambient decoration.

**The Semantic Pairing Rule.** Every surface uses its matched foreground token, including cards, popovers, sidebars, primary controls, and dark-mode equivalents.

## Typography

**Display Font:** Inter (with `ui-sans-serif`, `system-ui`, `sans-serif` fallbacks)  
**Body Font:** Inter (same fallback stack)  
**Label Font:** Inter

**Character:** Neutral, compact, and highly legible. Weight and scale create hierarchy without switching typefaces or relying on uppercase styling.

### Hierarchy
- **Display** (700, 36px, 1.111): Rare top-level statements and major empty states.
- **Headline** (700, 30px, 1.2): Primary page headings.
- **Title** (600–700, 24px, 1.333): Section and panel titles.
- **Body** (400–600, 16px, 1.5): Core reading and important control text.
- **Body Small** (400–600, 14px, 1.429): Task cards, controls, navigation, and dense application content.
- **Label** (400–600, 12px, 1.333): Metadata, badges, column summaries, and field labels.
- **Caption** (400, 10px): Timestamps and tertiary metadata only.
- **Metric** (700, 28px): Compact numeric summaries.

### Named Rules

**The Single-Family Rule.** Use Inter for every role; hierarchy comes from the documented scale, weight, and spacing rather than decorative font changes.

**The Tightening Rule.** Letter spacing remains neutral through 18px and tightens progressively from 20px upward.

## Layout

The system uses a 4px base rhythm with practical increments at 8, 12, 16, 20, 24, 32, 40, 48, and 64px. Application shells pair a quiet sidebar with a brighter content canvas. Major regions are separated by semantic borders or background changes; cards and controls use internal padding rather than oversized outer whitespace.

Dense operating surfaces should preserve one stable reading order: page context and actions first, then filters or view controls, then the work surface. Responsive adaptations may collapse secondary navigation and allow the work surface to scroll horizontally when preserving its information topology is more usable than compressing it.

## Elevation & Depth

Setu uses restrained layering. Borders and tonal surfaces establish most hierarchy. Shadows are reserved for cards that need slight separation and popovers that genuinely float above the work surface.

### Shadow Vocabulary
- **Extra Small:** `0 1px 2px rgba(0,0,0,0.05)` for subtle interactive lift.
- **Small:** `0 1px 3px rgba(0,0,0,0.10)` for compact floating elements.
- **Medium:** `0 4px 6px rgba(0,0,0,0.10)` for transient elevated regions.
- **Large:** `0 10px 15px rgba(0,0,0,0.10)` for rare modal-scale elevation.
- **Card Elevation:** `0 1px 3px rgba(0,0,0,0.08)` for canonical cards.
- **Popover Elevation:** `0 4px 12px rgba(0,0,0,0.14)` for menus, comboboxes, and popovers.

### Named Rules

**The Border-First Rule.** If a border or tonal shift can explain the layer, do not add a shadow.

## Shapes

The form language is softly geometric. Controls use 12px corners, cards use 14px, compact surfaces may use 10px, and larger containers can step through 18–30px. Pills and status badges use the full radius. Borders are one pixel by default, two pixels only for explicit emphasis, and focus treatment uses a three-pixel ring.

**The Radius-by-Scale Rule.** Corner size grows with the container; do not apply pill geometry to ordinary rectangular controls or task cards.

## Components

### Buttons
- **Shape:** Soft rectangular control with a 12px radius and 40px height.
- **Primary:** Signal Blue surface, pale-blue foreground, 14px medium text, and 10px × 16px padding.
- **Secondary:** Quiet Zinc surface with dark neutral text.
- **Outline:** Canvas surface with a one-pixel Hairline Stone border.
- **Ghost:** Transparent at rest with foreground text.
- **Destructive:** Alert Red surface with white text.
- **Focus:** Use the semantic ring color with the three-pixel focus-ring width.

### Chips
- **Style:** Full-radius badges with 12px medium or semibold text and compact horizontal padding.
- **State:** Primary for selected or emphasized status, secondary for neutral metadata, outline for quiet state, and destructive only for risk or failure.

### Cards / Containers
- **Corner Style:** 14px radius.
- **Background:** Semantic card surface and card foreground.
- **Shadow Strategy:** Card Elevation only when the card needs separation from its immediate background.
- **Border:** One-pixel semantic border.
- **Internal Padding:** 16px with an 8px content gap.

### Inputs / Fields
- **Style:** 40px field height, 12px radius, background surface, one-pixel input border, and 12px horizontal padding.
- **Text:** 14px regular; muted foreground for placeholders and normal foreground for entered values.
- **Focus:** Three-pixel semantic ring treatment.

### Navigation
- **Style:** A quiet sidebar surface with primary foreground text. The active item uses the sidebar accent surface and may carry a small blue indicator. Keep labels at 14px and preserve generous target sizes.

## Do's and Don'ts

### Do:
- **Do** bind components to semantic tokens so light and dark modes remain synchronized.
- **Do** use the 4px spacing scale and the established 12px-control / 14px-card radius relationship.
- **Do** reserve blue for meaningful actions, selection, focus, and data emphasis.
- **Do** use borders and tonal shifts before increasing elevation.
- **Do** keep dense metadata in the 12–14px roles while preserving clear task titles.

### Don't:
- **Don't** introduce gradients, glass effects, or decorative color outside the token system.
- **Don't** use Alert Red for ordinary priority; it is reserved for destructive or genuinely risky states.
- **Don't** hard-code light colors into components that must support dark mode.
- **Don't** apply large shadows to resting application surfaces.
- **Don't** mix radius values arbitrarily within one component family.
