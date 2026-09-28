# Design system — GTF HR

Status: visual specification v0.1 · Owner: Design + Frontend Lead · Updated: 2026-09-28

## Visual direction

Use the supplied three-stroke logo as the brand signature: magenta for primary actions, cyan for secondary emphasis, and yellow for limited highlights. Neutral surfaces, clear hierarchy, and tabular numbers keep dense HR information readable. Avoid oversized marketing hero sections in operational screens. Payroll confidence comes from explicit totals, provenance, review states, and alignment.

![GTF supplied logo](assets/gtf-logo.png)

The three dominant opaque non-dark colors were sampled from the supplied bitmap on 2026-09-28. They are source-image colors, not an independently verified corporate brand manual. Preserve the original raster aspect ratio (500:277), verified from the PNG header. Request a vector master before high-resolution brand reproduction; do not trace, stretch, recolor, animate, or crop the brush strokes.

## Color tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `brand.magenta` | `#E24397` | `#E24397` | Original brand accent |
| `brand.yellow` | `#FDE93D` | `#FDE93D` | Original highlight |
| `brand.cyan` | `#2AAEE4` | `#2AAEE4` | Original secondary accent |
| `surface.canvas` | `#F7F8FC` | `#0B1020` | Page background |
| `surface.panel` | `#FFFFFF` | `#111827` | Cards, tables, dialogs |
| `surface.raised` | `#FFFFFF` | `#1E293B` | Menus and floating surfaces |
| `text.primary` | `#111827` | `#F8FAFC` | Main text |
| `text.secondary` | `#475569` | `#CBD5E1` | Supporting text |
| `border.subtle` | `#E2E8F0` | `#334155` | Decorative dividers, not sole control edges |
| `border.control` | `#64748B` | `#94A3B8` | Input/control outline |
| `action.primary` | `#B51E70` | `#F472B6` | Primary action background |
| `action.primaryText` | `#FFFFFF` | `#111827` | Primary action label |
| `action.secondary` | `#087AA4` | `#38BDF8` | Secondary action emphasis |
| `action.secondaryText` | `#FFFFFF` | `#111827` | Secondary filled label |
| `focus.ring` | `#087AA4` | `#38BDF8` | Focus ring with surface offset |
| `status.successText` | `#166534` | `#86EFAC` | Success with icon/text |
| `status.warningText` | `#854D0E` | `#FDE68A` | Warning with icon/text |
| `status.dangerText` | `#B91C1C` | `#FCA5A5` | Error with icon/text |
| `status.infoText` | `#075985` | `#7DD3FC` | Information with icon/text |

Status text uses panel backgrounds unless separately tested. Brand yellow is not the warning state by itself. White labels on unmodified brand colors are not approved; use the action tokens or dark text. Selected navigation combines text weight, an indicator, and accessible text; never rely only on magenta tint.

Calculated WCAG contrast ratios for exact opaque pairs: white on primary light 6.20:1; white on secondary light 4.85:1; `#111827` on yellow 14.28:1, magenta 4.63:1, cyan 6.99:1; `#F8FAFC` on dark panel 16.96:1; `#CBD5E1` on dark panel 11.95:1; dark text on dark-theme primary 6.70:1. These calculations validate those pairs only, not the completed UI. Hover, disabled, composited, chart, and focus states require rendered checks.

## Typography and spacing

Use the user-requested Google Sans variable font, self-hosted through next/font/local with SIL OFL notices preserved. FE1 bundles the Latin 400–700 WOFF2; unsupported scripts/glyphs use system fallbacks until additional locale subsets are reviewed. Use rem units, normal text zoom, and tabular numerals for money, counts, times, and IDs.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Page title | 28/36px desktop, 24/32px mobile | 650–700 |
| Section heading | 20/28px | 600 |
| Card heading | 16/24px | 600 |
| Body / forms | 16/24px | 400–500 |
| Dense table / support | 14/20px | 400–500 |
| Caption | 12/18px, never essential instructions | 500 |
| Metric | 30/38px, no animated count-up | 650–700 |

Spacing scale in pixels: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Radii: control 8, panel 12, dialog 16, pill only for badges. Borders default 1px. Shadows are subtle and supplement borders; no glass blur behind dense data. Z-index layers: base 0, sticky 20, menu 40, overlay 60, dialog 70, toast 80; nested portals must preserve focus order.

## Primitive inventory and behavior

The detailed reusable inventory, controlled state ownership and required Iconsax adapter are in [reusable components](reusable-components.md). Use Iconsax consistently with semantic names, 16/20/24px sizing, `currentColor` and accessible labels. Validate the exact package/artwork provenance in [free resources](free-resources.md) before installing; no mixed or premium icon packs. Tailwind CSS and selected Radix primitives implement the system without a paid template subscription.

| Primitive | Required variants / behavior |
| --- | --- |
| Button | Primary, secondary, ghost, danger; 44px default target; pending text; icon accessible name |
| Input / Select / Textarea | Label, hint, error association, required state, disabled reason; no placeholder-only labeling |
| Checkbox / Radio / Switch | Keyboard and screen-reader states; switch reserved for immediate settings |
| Badge | Status label + optional icon; approved/pending/rejected semantics independent of theme |
| Card / Stat | Heading, value, period, provenance/freshness where needed; no hidden interactive card nesting |
| Table | Caption, semantic headers, sortable button and aria-sort, empty/error/loading states |
| Dialog / Sheet | Accessible name, initial focus, focus trap, Escape where safe, focus return, dirty-form confirmation |
| Tabs | Keyboard arrows, active panel association, URL-backed state when shareable |
| Alert / Toast | Inline durable error; toast only supplemental feedback; no private values in toast |
| Skeleton | Layout-specific geometry, one loading announcement, decorative shapes aria-hidden |
| Pagination | Current page/cursor, bounded size, preserved filters, large touch controls |
| Money / Date display | Explicit currency/zone context, locale formatting, accessible full value |

Primitives receive props and callbacks only. State, browser APIs, and command pending status belong to minimal feature controllers. Reuse an audited accessible headless primitive library if justified; do not reinvent complex keyboard interactions unnecessarily.

## Content rules

Use “Request leave”, “Review payroll”, and “Download payslip”. Show date range and period next to financial values. Use `₹54,200.00` with INR context; return raw machine values only through authorized export. Explain unavailable actions with a safe reason. Errors identify the field and next action, never blame the employee. Hindi localization is a future decision; design labels for 30% expansion and do not concatenate translated sentences.

## Acceptance

Review a component gallery in both themes at 360, 768, 1280, and 1440px, 200% zoom, keyboard-only, screen reader, reduced motion, and high-contrast mode. Accessibility baseline is WCAG 2.2 AA, including contrast and non-color cues. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)

This document owns visual tokens. [Dark mode](dark-mode.md), [motion](motion.md), and [size management](size-management.md) own behavior and measurable limits.
