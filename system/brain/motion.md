# Motion specification

Status: restrained interaction motion baseline · Owner: Design + Frontend Lead · Updated: 2026-09-28

## Principles

Motion explains a state change; it never delays attendance capture, approval, form entry, or payroll review. Critical values render immediately. No animated salary counters, auto-playing backgrounds, parallax, scroll-jacking, repeated attention pulses, or celebratory animation after a financial action.

Framer Motion is the user-selected library for programmatic transitions. FE1 uses LazyMotion, a controlled Radix dialog, a 180ms fade with at most 6px movement, and zero-duration reduced-motion behavior. CSS handles simple hover/focus feedback. Sonner owns toast movement with reduced-motion CSS overrides. GSAP is excluded under the updated free/open-source constraint; see [free resources](free-resources.md). Never add an animation dependency or client boundary to the shared shell merely for branding.

## Motion tokens

| Event | Duration | Property / behavior |
| --- | --- | --- |
| Hover/pressed feedback | 100–140ms | Color/opacity; no layout movement |
| Menu opening | 140–180ms | Opacity and ≤4px translation |
| Dialog/sheet | 180–220ms | Opacity and short transform; immediate focus management |
| Expand/collapse small details | 160–200ms | Prefer fixed/clipped geometry; no large layout animation |
| Toast entrance/exit | 160ms | Opacity; error remains available inline |
| Skeleton-to-content | 100–140ms | Opacity within reserved geometry |

Standard easing: `cubic-bezier(0.2, 0, 0, 1)`. Exit easing may be linear or ease-in. Durations are maxima for normal interaction, not mandatory delays. Initial server-rendered content is visible without running animation code.

## Skeletons and reduced motion

Skeleton dimensions match actual route sections. Boneyard generates responsive skeleton geometry from rendered synthetic UI. Pulse is subtle and stops entirely for reduced motion; no spinner substitutes for geometry. A static SSR fallback must render before browser measurement. Disable shimmer, transform transitions, and decorative animation under `prefers-reduced-motion: reduce`. Loading announcements remain accessible without animation. Avoid announcing every skeleton cell.

No spinner substitutes for a skeleton. For mutations, show a stable button label such as “Submitting…” and an `aria-busy` region; reserve width to avoid button movement. Do not disable unrelated form navigation unless necessary to preserve transaction integrity.

## Lifecycle and performance

Animate opacity/transform where possible. No global `will-change`, unbounded requestAnimationFrame loops, or layout reads/writes each frame. Pause nonessential work when hidden. Cancel browser Animation objects on unmount and route change, and dispose media-query handlers/listeners. Do not replay every animation on server refresh.

For programmatic motion, document purpose, code/bundle cost, fallback, keyboard behavior, reduced-motion version, teardown test, and trace evidence. It must meet the shared route bundle budget and must not create >50ms main-thread tasks on the baseline device. [Size management](size-management.md) owns budgets. Iconsax remains static in ordinary controls; no paid animated icon pack is required.

## Acceptance

Test rapid open/close, repeated route navigation, form resubmission, low-end mobile throttling, background/foreground changes, keyboard navigation, reduced motion, and JavaScript failure. There must be no leaked listeners, detached animated nodes, hidden content waiting for a timeline, focus moving with decoration, or animation-dependent business state.

## FE1 sidebar motion

The user supplied expanded/collapsed Codex screenshots as visual reference. `WorkspaceFrame` owns a local collapsed boolean. Framer Motion animates a shared numeric CSS progress variable over 240ms so the desktop sidebar and content column move together, down to a 64px rail. Mobile uses the same progress value for navigation height/opacity; hidden navigation is inert. System reduced motion changes duration to zero. The toggle is labelled and keyboard-operable, and rail links keep accessible names. Server-rendered child sections remain slots rather than being converted to client data components.
