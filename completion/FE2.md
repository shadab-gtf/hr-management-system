# FE2–FE6 — product frontend on the mock backend

Updated: 2026-09-28. Status: implemented against the synthetic mock backend. Local verification passed. This is **frontend behaviour on mock data**; none of it is backend enforcement, real HR data, payroll certification or a production deployment.

## Scope delivered

| Area | Delivered |
| --- | --- |
| Architecture | Per-module services `lib/api/<module>/<module>.service.ts` behind one transport (`lib/api/core`) with mock/live switch `GTF_API_MODE`; Zod contracts in `types/`; server actions per module; mock handlers per module; client hooks in `hooks/`; features/sections per module |
| Identity & roles | Demo sign-in (4 personas; reporting-manager demo removed on request), capability-driven navigation with expandable greytHR-style groups, per-page capability checks and non-disclosing denials, proxy gate |
| Home | Greeting, role stats (team/HR/payroll), today's attendance capture, tasks, leave balance, Track (open requests), IT declaration, quick access, payslip & holidays, celebrations, announcements — each streamed under its own skeleton |
| Engage | Feed with group filters and search, posts, optimistic reactions, comments, author delete; HR announcements mirrored into the feed |
| Salary | Payslips + detail/print, YTD by component, illustrative IT statement (new/old regime), IT declaration (section limits, HRA, draft/submit, window & POI status), loans & advances with request, salary revision & structure, reimbursement (expenses) |
| Leave | Apply (server-computed units, overlap/balance/half-day rules), cancel, balances, team leave calendar (reasons hidden), holiday calendar |
| Attendance | Check-in/out with optional one-shot location → mock geofence verification, month calendar, exceptions, regularization, permission (≤3 h, 2/month), team view |
| People | Directory with URL filters and cursor pagination, starred colleagues, org chart with search highlighting, profiles with field projection, profile change requests, profile photos (versioned URLs update everywhere) |
| Documents | Category hub, uploads (quarantine/scan states), letter requests and tracking |
| Helpdesk | Active/closed, conversation threads, replies, close, HR queue excluding confidential categories |
| Requests | Unified request hub across 8 modules; workflow delegation with date/workflow bounds, cycle and self-delegation guards, revocation; approvals honour active delegations |
| Approvals | Leave, attendance correction, permission and expense review with impact, overlaps, duplicate warnings, versioned decisions, no self-approval |
| Payroll | Overview, readiness, run workbench (validation, variance, component totals, audit), maker/checker submit → approve → publish; "published ≠ paid" |
| HR admin | Onboarding checklists with blocking tasks, announcement publishing/archiving, workforce reports, formula-safe CSV export with per-request permission check |
| PWA & device | Manifest + icons generated from the original logo, service worker caching only public assets and `/offline`, update prompt, offline banner, compact install card (bottom-right on desktop, top on phones; Android/iOS), permission center (location/notifications/camera, requested only on user action), in-app camera for profile photos, Permissions-Policy `camera=(self), geolocation=(self)` |
| Design | Tokens only (manifest colours are the documented exception), native mobile type scale, bottom tab bar + More hub, bottom sheets, compact mobile list mode for tables, dark mode |

## Verification executed

- `pnpm check`: ESLint (0 warnings), strict typecheck and production build — 41 routes.
- Playwright on the production build (Chromium): **43/43 passed** across `foundation.spec.ts`, `product.spec.ts` and `modules.spec.ts`:
  - role gating
  - check-in, geofence-verified location, and denied-location fallback
  - leave (including holiday-only rejection with form values retained)
  - regularization, approvals and rejection reason
  - payroll maker/checker
  - profile photo propagation
  - Engage
  - IT declaration limits
  - loans, letters and the request hub
  - helpdesk threads and confidential queue exclusion
  - delegation
  - starring and org chart
  - HR admin publish, onboarding and CSV
  - PWA manifest, service worker, offline page and Permissions-Policy
  - settings permissions
  - axe at 360px (light) and desktop (dark) on the new routes
  - no horizontal overflow at 360px
- Route smoke test for all 4 personas across 36 routes: correct denials only, no error states, no server errors logged.
- Defects found and fixed during verification:
  - Service worker reloaded the page on first install.
  - Session cookie was forced `Secure` over plain HTTP, which broke sign-in on LAN previews.
  - A data export crossed the client/server boundary and crashed Document center.
  - Stale hot-reload mock store crashed Approvals; the store is now versioned.
  - React 19 form reset discarded input after validation errors.
  - Nested interactive org-chart summary (axe finding).
  - Mobile composer clipping.

## Mock vs real behaviour

| Mocked here | Real system must provide |
| --- | --- |
| Demo personas via cookie | Keycloak/OIDC sign-in, MFA, revocable sessions |
| In-memory store, resets on restart | PostgreSQL with RLS, audit, idempotency records |
| Synthetic salaries, statutory and TDS math (labelled illustrative) | Finance-approved rules, exact decimal engine, shadow-payroll reconciliation |
| Geofence check with 3 sample sites | Location service, site registry, spoofing heuristics, policy on evidence use |
| Upload records metadata only; no bytes stored | Upload grants, object storage, malware scanning, authenticated download proxy |
| Test notification only; no server push | VAPID keys, push subscription endpoint, minimal-payload delivery |
| Delegation and approval rules emulated in handlers | Server-side policy module and workflow engine |

## Remaining / release gates

- [ ] Backend endpoints for every service (paths are listed in each `*.service.ts`), then run the suite with `GTF_API_MODE=live`.
- [ ] Real document download and upload-to-storage flow; payslip PDF generation server-side.
- [ ] Web push (VAPID) and notification preferences; SSE/refresh policy for live updates.
- [ ] Regenerate Boneyard skeleton bones for the new routes (currently layout-matched CSS skeletons; the Boneyard CLI cannot sign in — see FE3).
- [ ] Real-device checks (iOS Safari install, Android install, camera and geolocation prompts over HTTPS), Firefox/WebKit, assistive technology.
- [x] Lighthouse re-measured 2026-09-29 on production `/login`: 99 / 100 / 100 (signed-in routes not profiled — see FE3).
- [ ] Items still open from FE1 (Iconsax artwork provenance, SBOM, ESLint major).
