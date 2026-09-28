# Size management of web pages and components

Status: initial measurable budgets · Owner: Frontend Lead + Performance Owner · Updated: 2026-09-28

## Layout dimensions

| Element | Baseline | Responsive behavior |
| --- | --- | --- |
| Viewports under test | 360, 390, 768, 1024, 1280, 1440, 1920px | No body overflow; 200% zoom required |
| Content canvas | Max 1440px | 16px mobile padding, 24px tablet, 32px desktop |
| Navigation rail | 256px desktop; optional 72px collapsed | Drawer below 1024px; bottom navigation for mobile ESS |
| Top bar | 64px | Reserve geometry; no height shift after user data |
| Mobile bottom navigation | 64px + safe-area inset | Content padding prevents covered controls |
| Form content | 640–720px max | One column on narrow screens |
| Dialog | 480px standard, 720px complex | Width ≤ viewport−32px; internal scroll and safe focus |
| Side sheet | 440px, max 100vw | Full width on small screens |
| Controls | 44px height, 44px touch target | Dense desktop rows may visually shrink with retained accessible target |
| Data rows | 48px default | Multi-line content expands; never clip errors |
| Page-size options | 25 default, 50, 100 maximum | Server pagination; no giant initial DOM |
| Logo display | 90×50px compact, 180×100px sign-in | Preserve 500:277 aspect ratio via proportional auto sizing |

Logo examples are rounded layout boxes; the image itself uses its true intrinsic ratio within the box. Intrinsic width/height must be specified. Text containers use wrapping/min-width rules so long names and localized labels do not force overflow. Avoid fixed card heights for variable content except reserved loading geometry sized to the known layout.

## Transfer and runtime budgets

These are proposed acceptance budgets, not measured results. Values are compressed network transfers unless stated otherwise; a KiB is 1024 bytes.

| Resource | Initial target / gate |
| --- | --- |
| Common ESS initial JavaScript, including framework | ≤200 KiB per cold route |
| Payroll/report initial JavaScript | ≤250 KiB; heavy charts/editors deferred |
| Added feature JavaScript | ≤35 KiB without a reviewed ADR |
| Initial CSS | ≤40 KiB per route |
| Custom font transfer | 0 initially; ≤100 KiB total if approved later |
| Above-fold raster image | ≤100 KiB optimized output; logo optimized separately |
| Typical employee avatar | ≤15 KiB served at rendered responsive size |
| Typical list JSON/React data payload | ≤100 KiB for default 25 rows |
| Initial private HTML + streamed data | ≤200 KiB excluding cached assets |
| Request JSON | ≤1 MiB; files use dedicated upload flow |
| File upload | 10 MiB per file, allowlisted PDF/JPEG/PNG initially |
| Standard report export | 100,000 rows maximum, streamed in worker; larger scope needs reviewed partitioned job |
| DOM on a standard initial route | Target <1,500 nodes; investigate growth |
| User-triggered main-thread task | No app-created task >50ms on baseline trace |

Report/image processing also needs decoded pixel/page limits; file bytes alone do not prevent memory exhaustion. CSV export is streamed and formula-safe. PDF generation is server-side. Do not download charting, PDF, spreadsheet, or animation libraries globally.

## Performance test protocol

Use production builds on a fixed CI browser/runtime, seeded non-sensitive accounts, cache-cold route visits, and the same mobile CPU/network throttling profile recorded with results. Run five samples per critical route and use the median Lighthouse score; target performance ≥95. Critical matrix: sign-in, employee dashboard, people list, leave form, approvals, payroll run, payslip list. Track accessibility separately with manual verification.

Targets: LCP ≤2.5 seconds, INP ≤200ms at field p75 when enough representative traffic exists, CLS 0 in controlled skeleton/image-loading scenarios and no reproducible avoidable layout shift. Field CLS >0.05 triggers investigation even if aggregate page score is high. Do not label a synthetic interaction timing metric as field INP. Record page weight, long tasks, and backend timing with each regression.

Proposed backend budgets under the agreed load: ordinary reads p95 ≤400ms, commands p95 ≤800ms excluding user/network latency and async job completion. Attendance durable acknowledgment p95 ≤500ms under the peak fixture. Async reports/payroll expose progress and queue age; they are not forced into request-time execution.

## Source-code size and maintainability

Review files over 300 nonblank lines and components over 200 lines for mixed responsibilities; these are review triggers, not reasons to split cohesive code mechanically. Pages should generally stay under 100 lines of orchestration. Extract repeated UI/policy logic once a real shared responsibility exists. Prohibit broad barrel imports that accidentally pull server modules or large packages into clients.

Bundle reports in CI compare route chunks against baseline and fail explicit transfer caps. A temporary exception must name the measured overage, user impact, owner, remediation task, and expiry; security and authorization requirements cannot be waived by a performance exception. [GitHub Actions](github-action.md) and [testing](testing.md) define enforcement.
