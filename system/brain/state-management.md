# State management and data ownership

Status: normative web state strategy · Owner: Frontend + Backend Leads · Updated: 2026-09-28

## Default decision and libraries

Use **TanStack Query** for shared async-data caching and mutation lifecycle, as explicitly requested for FE1. Next.js server pages own initial reads through `lib/api` and hydrate only allowed DTOs into a per-request query client. Feature controllers observe the browser-memory cache; sections/UI remain presentational. React `useState`/`useReducer` own local form drafts and open/closed state. No Redux, Zustand or SWR is installed. Sonner provides supplemental toasts; durable errors remain inline.

PostgreSQL and domain services own persistent business state. Keycloak plus revocable server sessions own authentication. Pages orchestrate reads through `lib/api`; sections and UI receive props. A client store is never the source of payroll, leave balance, permissions or attendance truth.

## State ownership matrix

| State | Owner/source | Frontend handling | Persistence |
| --- | --- | --- | --- |
| Employee/employment record | PostgreSQL query service | Page-loaded minimal DTO | Server database only |
| Leave available/reserved/used | Transactional ledger/policy service | Display server values; command refresh | Server ledger; no client balance store |
| Attendance event/day | Raw-event/projection services | Display source freshness and confirmation | Server; no offline punch queue initially |
| Payroll result/payment status | Frozen run/state machine | Read-only result + authorized command forms | Server immutable records |
| Permissions/session | Keycloak + membership/policy/session services | Minimal capabilities for UX; server checks every operation | Secure HttpOnly session cookie + server state |
| Search/filter/sort/page | Validated route input | URL-backed allowlisted nonsecret filters | URL/history where appropriate; no salary/bank/reason payloads |
| Form draft | Feature controller | Native form state or useState/useReducer | Component memory; restricted data never localStorage |
| Submit pending/result/error | Feature controller + server-action result | useActionState / form pending APIs | Component memory; durable server receipt for success |
| Dialog/menu/selection | Feature controller | Controlled props into UI | Local memory; clear irrelevant selections on scope change |
| Theme | Preference cookie + system media query | Tiny theme controller | Non-sensitive theme value only |
| Job progress | Server job record | Page-provided status + navigation refresh | Server; no hidden component API polling |
| Device permission/network status | Browser API | Small client controller, advisory UX | Memory; server still validates commands |

Shareable URLs must not contain credentials, bank/tax IDs, leave reasons or private document links. Directory search queries may contain personal work identifiers: minimize them, redact query strings in telemetry and define acceptable history exposure. Restricted searches should use a server-handled form and a scoped result context rather than spreading sensitive values through URLs.

## Read and streaming lifecycle

1. A navigation supplies route/search input to the server page.
2. Page-local async helpers validate input, call authorized `lib/api` facades and resolve DTOs underneath Suspense boundaries.
3. Matching skeletons reserve geometry while reads run; unrelated sections may stream independently.
4. Sections receive resolved props, choose layout and compose presentational UI. No component starts its own read.
5. A filter/page change navigates to a validated URL or submits the approved server form, re-entering the page data layer.

Avoid copying page props into a global client store. A form can initialize a draft from an editable DTO, but its record version and dirty state must be explicit; background refresh must not silently replace unsaved input. Independent calls can be concurrent; repeated reads use request-scoped deduplication, never cross-user memoization.

## Command lifecycle

`idle → validating/submitting → confirmed | validation_error | conflict | confirmation_pending | failed` is a UI state machine, not the domain state machine.

1. Create a command key for an intended mutation and keep it stable for retries of that same intent. Changing the payload requires a new intent/key after the prior result is understood.
2. Submit the page-supplied server action with fields, expected version and key. Derive identity and all authoritative quantities on the server.
3. While pending, keep button geometry, announce status, prevent accidental duplicate interaction but do not rely on disabling for correctness.
4. On success, display server reference/state and refresh only affected routes/data views.
5. On field errors, preserve permitted transient values and focus the relevant error summary/field.
6. On stale version/conflict, show current server state and require review; do not auto-merge financial or approval changes.
7. On response loss, show confirmation pending and recover the original command result/current route state. Do not create a second payout/leave posting/punch.

Optimistic changes are allowed only for harmless UI preference state where rollback is clear. Leave balances, attendance success, workflow approvals, payroll publication and payment settlement must wait for durable server confirmation. Server rejection overrides all frontend expectations.

## Local state design

Use `useState` for one independent value such as open/closed dialog or a filter draft. Use `useReducer` when a form has several related transitions and a reducer clarifies invariants; the reducer handles presentation flow, not leave/payroll rules. Use context only for a small stable cross-tree concern such as theme or scoped interaction state, with minimal providers near consumers.

A multi-step payroll screen reads its actual run state from the server; a local “step 5” variable cannot authorize approval or skip validation. Do not store a full employee directory, bank details, document blobs or role catalog in context. Do not add a global state library merely because the system has many modules.

Only feature controllers call state hooks. Presentational UI wrappers remain controlled/stateless with typed props; sections do not own domain state. Server pages cannot call browser hooks or contain `use client`. Form callbacks passed across the server/client boundary must be supported serializable action references, not arbitrary server closures pretending to be browser event handlers.

## Refresh, cache and revocation

Private HTTP/API/React responses must follow the explicit no-store policy. Do not add persistent browser caches, IndexedDB stores, service-worker caches or saved client-query caches for private data. Next.js/browser navigation may retain transient rendered state; logout must revoke the server session, clear sensitive feature state and perform a full navigation to a generic public page so another login cannot reuse the prior workspace.

Test back/forward navigation, restored tabs, logout/login as another employee and mid-session role revocation. Revalidate before protected actions/downloads. For restored stale views, show a neutral pending state and refresh through the page layer before resuming sensitive interactions. Revocation cannot erase a screenshot or file already deliberately exported; do not promise retroactive removal.

Theme preference may persist because it is non-sensitive. Salary, profile, form drafts, permissions and current employee scope may not be persisted under the same preference mechanism. Refresh tokens/access tokens stay out of web localStorage; native token storage has its separate secure-platform contract.

## Long-running jobs and live information

Initial web implementation uses visible job status, manual refresh/navigation and optional bounded `router.refresh()` in a narrowly scoped client controller. The refresh re-enters page-owned fetching; no direct component API request is introduced. Pause automatic refresh when the document is hidden, operation is terminal or repeated failures occur; cap frequency to avoid load/focus churn.

An optional future SSE/WebSocket requirement needs an architecture decision describing central transport ownership, authorization, lifecycle and refresh behavior. Do not add a real-time client cache by default. Updates must not overwrite dirty forms or trigger repeated screen-reader announcements for unchanged states.

## Forms and validation

Use native form semantics and server-side Zod first. Basic client hints can improve usability but never replace authorization or business validation. Do not bundle complete server schemas or payroll formula graphs into the browser. Avoid mirroring server errors in several competing stores; one typed action result controls feedback for each command.

Sensitive inputs remain transient and are cleared on completion, logout or abandoned edit. Password/bank fields are not saved in offline drafts or analytics. File state stores upload reference/progress only as needed; original bytes are not persisted casually in browser storage. Dirty-form confirmation protects work without preventing safe logout/security revocation.

## When to reconsider libraries

A new state library requires a demonstrated cross-route interaction problem, bundle measurements, security/storage design, owner and ADR. It must not violate page-owned web reads, duplicate backend rules or require a paid service. If React Hook Form or an OSS reducer/store library is later justified, scope it to feature state and preserve the same ownership matrix.

## Verification

Test double-clicks, lost responses after commit, stale form versions, refreshed balances, concurrent approvals, hidden/resumed tab, role revocation, logout/back/relogin, theme hydration, failed partial section, dirty-form refresh, slow network and reduced motion. Inspect client bundles/storage to ensure no backend SDKs or private persistent state. Link evidence to T-01–03/T-09–16/T-25–27/T-30.

## FE1 implementation detail

`lib/state/query-client.ts` creates isolated query clients with explicit stale/GC/retry defaults. The server page sets the scoped demo key and dehydrates it under Suspense. `TablePreview` consumes that cache with `useQuery` and `skipToken`, so there is no component fetch or duplicate initial request. The four synthetic rows are filtered locally for the component gallery only. Live HR search remains server-scoped. No cache persister is installed. Before real identity is introduced, keys must include session/organization/scope and caches must be cleared on logout, account switch and permission changes. Future mutations call centralized server actions and synchronize authoritative results; they must not optimistically approve leave or payroll. FE1 does not simulate successful backend writes.
