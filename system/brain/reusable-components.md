# Reusable components and Iconsax integration

Status: UI architecture specification · Owner: Frontend Lead + Design · Updated: 2026-09-28

## Component boundaries

| Folder | Responsibility | State and data rules |
| --- | --- | --- |
| `components/ui/` | Reusable presentational primitives | Typed props/callbacks only; no application state, APIs, business rules or permission lookup |
| `components/sections/` | Page layout and composition | Resolved DTO/view props; no fetching or policy computation |
| `components/features/` | Small interaction controllers | Local draft/pending/open state, browser APIs, supplied server actions |
| `app/**/page.tsx` | Server data orchestration | Calls `lib/api` in page-local helpers under Suspense; composes sections |

A stateful third-party behavior primitive does not authorize adding business state to a UI wrapper. Use Radix in controlled mode with application open/selection state supplied by the feature controller. Library-managed focus/keyboard mechanics stay encapsulated. Prefer semantic native controls when they satisfy the need with less JavaScript.

## Reuse rules

Extract when behavior/appearance is actually shared or accessibility complexity warrants one reliable implementation. Do not create a generic component for every div or one huge schema-driven form/table that hides domain rules. Reuse money/status/layout primitives across HR modules; keep payroll and leave state machines domain-specific. No `any`, untyped prop spreading into DOM, or duplicate role variants of the same table.

Primitives have small explicit interfaces and safe defaults. Feature-specific strings/columns/actions are props. UI receives safe display data only; excluded private fields must not exist in props. Static primitives remain Server-Component-compatible where dependencies permit.

## Primitive inventory

| Component | Reused by | Essential contract / states | Render model |
| --- | --- | --- | --- |
| `AppIcon` | Navigation, buttons, fields, status | Semantic name, size, approved variant, decorative flag/accessibility; `currentColor` | Server-safe static adapter if verified package permits |
| `Button` / `IconButton` | All commands/navigation controls | Variant, disabled/pending text, label, submit type; no spinner | Server-safe shell or client callback consumer |
| `FormField` | Profile, leave, attendance, claims | ID, label, hint/error linkage, required state and child control | Presentational |
| `TextInput` / `TextArea` / `SelectField` | Forms/filters | Controlled value or native form value, constraints, described-by | Native first; controller outside |
| `Checkbox` / `RadioGroup` / `Switch` | Settings/selections | Supplied checked/value and callbacks; visible labels | Minimal controlled interaction |
| `StatusBadge` | Leave, files, runs, tickets | Semantic tone + explicit text; icon optional | Server-safe |
| `MoneyText` / `DateText` | Pay/reports/time | Exact amount/date and display locale/zone; no calculations | Server-safe formatting |
| `Card` / `StatCard` | Dashboard and summaries | Heading, value, period, safe metadata/freshness, optional action slot | Server-safe |
| `DataTable` | People, approvals, payroll, reports | Explicit typed columns/rows/row keys; caption; no fetch/client policy sorting | Semantic server-first table |
| `Pagination` / `FilterBar` | Lists/reports | Validated page/cursor/filter values and navigation/action targets | Links/forms; small controller only if needed |
| `EmptyState` / `InlineError` / `Alert` | All async views | Specific safe reason, recovery action and accessible announcement | Presentational |
| `SkeletonBlock` / `SkeletonRow` | Route/section loading | Reserved dimensions, aria-hidden shapes, motion-safe style | Server-safe |
| `Dialog` / `Sheet` / `Dropdown` | Edits/reviews/menus | Controlled open, title/description, close policy, focus return | Radix-backed minimal client boundary |
| `TabsNav` | Detail routes | URL-backed links, selected route, keyboard semantics | Server links unless truly local tabs |
| `FileStatus` / `FileItem` | Documents/expenses/onboarding | Safe filename/classification/status and allowed actions | No upload/storage SDK inside |
| `ProgressSummary` | Imports/payroll/exports | Authoritative job counts/status/freshness | Receives props; no internal polling |
| `AuditTimeline` | Employment/requests/payroll | Authorized event DTOs, safe timestamps/actor labels | Server-safe |
| `StepIndicator` | Import/payroll/lifecycle | Current authoritative step, completed/blocked labels | No business transition logic |

Do not install every Radix module at scaffold. Add dialog/menu/select dependencies only when their corresponding control is used and native alternatives are insufficient. Do not build a global `DataTable` with downloads of all rows merely to sort or filter; the page passes the requested server slice.

## Reusable sections and feature controllers

| Section | Shared composition | Owning controller, when needed |
| --- | --- | --- |
| `WorkspaceSection` | Navigation, heading, content slots | Mobile navigation/theme controls |
| `EmployeeListSection` | Filters + table + pagination + states | Search/filter submission, employee form |
| `EmployeeDetailSection` | Safe summary, route tabs, history/documents | Permitted profile/employment change request |
| `AttendanceSection` | Day/month data, exception list | Attendance capture/regularization |
| `LeaveSection` | Available/reserved cards, history | Leave request/cancellation |
| `ApprovalsSection` | Assigned queue and review layout | Versioned decision form |
| `PayrollRunSection` | Readiness, totals, variance, trace and step indicator | Prepare/review/approve/publish commands as permitted |
| `DocumentsSection` | Upload instructions and file states | Upload/complete action flow |
| `ReportSection` | Report filters, jobs and artifact list | Generate job and route refresh |

These are planned responsibilities, not instructions to create empty files in advance. Route skeleton sections mirror their real section's geometry using shared skeleton primitives. Domain controllers share lower-level field/error/action-result helpers only after repetition proves useful.

## Iconsax standard

Iconsax is the only planned icon family. Candidate package: `iconsax-reactjs` from the currently documented `rendinjast/iconsax-react` repository; do not install both it and the older `iconsax-react` automatically. The exact version, exported icon names, types, peer dependencies and asset-license provenance must be validated in MT-005. [Repository](https://github.com/rendinjast/iconsax-react). [License boundary](free-resources.md).

Default UI variant: Linear; selected navigation may use Bold if the approved package supports it. Sizes: 16px compact inline, 20px field/button, 24px navigation, 32px empty-state accent. Icon size does not shrink the required 44px interactive target. Use `currentColor` so semantic theme tokens control contrast. No giant icon catalog serialized to clients or runtime icon-name downloads.

Define a small application semantic vocabulary (`home`, `people`, `attendance`, `leave`, `payroll`, `documents`, `reports`, `settings`, `approve`, `reject`, `download`, `upload`, `search`, `warning`, `success`). Map these to **verified** static package exports centrally; do not invent export names in implementation. Import named exports in bounded modules and check the resulting bundle; a giant global registry can defeat tree-shaking.

Decorative icons accompanying visible text use `aria-hidden` and cannot receive focus. An icon-only button gets its accessible name on the button; tooltips are supplemental. A standalone meaningful image gets an accessible label. Status icons always have text. If the package requires a client boundary, confine it to the adapter instead of marking pages or entire sections client-side; benchmark cost and investigate a compatible Iconsax artifact if needed.

Do not redraw/relicense Iconsax assets or substitute premium/current artwork based only on a package MIT label. No paid icon kit is installed. This is the only unresolved artwork-provenance exception tracked in the FOSS selection; product UI can be specified without declaring its rights already cleared.

## State, accessibility and verification

Feature controllers own form drafts, pending commands and dialog open state. Pages own loading of server state. All domain quantities and permission results come from the backend. See [state management](state-management.md).

Review reused controls in both themes with long names, large amounts, empty/error/loading states, keyboard/screen reader, reduced motion, 360px layouts and 200% zoom. Verify controlled dialog focus/return, form errors, table headers, icon labeling and skeleton stability. Package upgrades rerun this matrix and bundle checks. Component reuse is successful when behavior stays consistent without hiding domain rules.
