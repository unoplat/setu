---
target: Paper Components page Task Card
total_score: 21
max_score: 32
na_heuristics: 9,10
p0_count: 0
p1_count: 2
timestamp: 2026-08-26T12-33-00Z
slug: p-paper-design-file-01m0j1fvxvrp4mw8m8m4tdcht9-2-1
---
# Task Card Critique

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Selected, focus, dragging, and overdue states are documented but not shown. |
| 2 | Match System / Real World | 4 | Task ID, milestone, dates, priority, and assignee match Envision terminology. |
| 3 | User Control and Freedom | 2 | Open and drag behavior is described, but undo and escape behavior are unspecified. |
| 4 | Consistency and Standards | 3 | Tokens are coherent; persistent shadow conflicts with the border-first rule. |
| 5 | Error Prevention | 2 | Long labels, localized dates, and missing avatars are not demonstrated. |
| 6 | Recognition Rather Than Recall | 3 | Metadata is labeled; avatar identity is not fully explicit in the first variant. |
| 7 | Flexibility and Efficiency | 2 | Keyboard access is stated, but compact and expanded behaviors are not shown. |
| 8 | Aesthetic and Minimalist Design | 3 | Strong hierarchy, but blue is reused decoratively and spacing is loose at board density. |
| 9 | Error Recovery | n/a | Static display component; no recovery flow exists in this specimen. |
| 10 | Help and Documentation | n/a | Component-level specimen, not a help surface. |
| **Total** | | **21/32** | **Acceptable; focused refinement needed** |

## Design Specificity Verdict

The card is grounded in Envision through ERPNext Task ID, Milestone, dates, and board-density needs. It is not generic content-card styling, but the original elevation and uniformly loose rhythm make it feel more like a floating SaaS tile than a calm operational record.

Deterministic scan of `frontend/src/components/ui/card.tsx` returned `[]` with exit code 0. No rules or locations were reported. The scan did not catch the documented implementation mismatch: the generic Card uses `shadow-md` plus a ring, while Envision's design guidance reserves elevation for transient surfaces and prefers borders at rest. Browser overlay was unavailable because the reviewed artifact is a Paper-only specimen.

## Overall Impression

The information hierarchy is sound. The biggest opportunity is to make the card flatter, denser, and more lane-like so dozens of cards remain calm when repeated across the board.

## What's Working

- The task title is clearly dominant without becoming oversized.
- Milestone, dates, priority, and assignee support operational scanning.
- Inter, zinc neutrals, and restrained signal blue fit the existing system.

## Priority Issues

### P1 — Blue has become ambient decoration
**Why it matters:** Milestone and tag use the same blue despite representing unrelated metadata, weakening semantic meaning.
**Fix:** Keep blue on the Milestone marker or interaction state; render Tag in zinc.
**Suggested command:** `$impeccable colorize`

### P1 — The footer is fragile
**Why it matters:** Date range, subtask count, and avatar compete inside 280px of content width and will crowd under localization or text enlargement.
**Fix:** Use two stable footer zones, allow wrapping, and expose the assignee name rather than relying on initials alone.
**Suggested command:** `$impeccable harden`

### P2 — Elevation and spacing are too generous
**Why it matters:** Repeated 24px shadows and 16px gaps create board haze and reduce useful density.
**Fix:** Use a border at rest, shadow only while dragging, 16px padding, 12px major gaps, and 6–8px within metadata groups.
**Suggested command:** `$impeccable layout`

## Persona Red Flags

**Alex (Power User):** Loose spacing reduces the number of tasks visible per column; no visible compact-state or keyboard-focus specimen confirms an efficient path.

**Sam (Accessibility-Dependent User):** Initials alone do not identify an assignee, and interaction states are described rather than demonstrated. Date and metadata behavior at 200% text remains unverified.

**Riley (Stress Tester):** Long milestone names, multiple tags, localized date ranges, missing avatars, and three-line titles are not represented.

## Minor Observations

- The High badge is readable, but neutral urgency styling may need state-specific validation across all four priority levels.
- A fixed label lane makes Milestone and Tag values easier to compare vertically.
- Subtask progress should remain omitted unless product requirements explicitly call for it on the Card.

## Questions to Consider

- Should the board optimize for maximum task density or a more spacious reading experience?
- Should signal blue identify Milestones, selected cards, or only direct interaction states?
- Which metadata should survive when the card reaches its narrowest supported width?
