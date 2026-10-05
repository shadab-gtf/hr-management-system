# GTF HR · web frontend

Next.js App Router frontend for GTF Technologies' HR platform. It is a role-based product UI, mobile-first and installable as an app (PWA). It reads and writes through the standalone HR API in `gtfhrbackend/` (PostgreSQL); `GTF_API_MODE=mock` switches to synthetic demo fixtures for demos and Playwright runs.

The repository parent contains two child projects: [`gtfhrfrontend/`](./gtfhrfrontend/) (Next.js) and [`gtfhrbackend/`](./gtfhrbackend/) (Node.js + TypeScript + Express + Prisma + PostgreSQL). Run package commands from their respective directories. Every frontend operation is served by the backend API; the backend README documents setup and routes, and [completion/BACKEND-STATUS.md](./completion/BACKEND-STATUS.md) records verification and remaining work.

## Run locally

Use Node 22.20.0 and pnpm 10.33.2.

```sh
cd gtfhrfrontend
pnpm install --frozen-lockfile
pnpm dev                 # http://127.0.0.1:3000
```

Sign in with a configured real account. Access and role permissions come from the database. Demo personas and fixture data are opt-in only with `GTF_API_MODE=mock`:

| Example role | Roles | Access |
| --- | --- | --- |
| Employee | employee | Self-service: attendance, leave, salary, documents, helpdesk, requests |
| HR operations | employee, manager, HR operator | + People admin, team approvals, delegates, HR queue, onboarding, announcements, reports |
| Payroll operator | employee, payroll operator | + Payroll preparation and submission (cannot approve own run), reports |
| Finance approver | employee, manager, payroll approver | + Independent payroll approval and publication, team approvals, reports |

Mock data is synthetic, in-memory test/demo data. It resets on restart and is rebuilt daily, relative to today's IST date. Do not use mock mode for real HR workflows.

## Switching to the real API

Pages never know which backend served them. Every read and command goes through `services/api/<module>/<module>.service.ts` → `services/api/core/transport.ts`, and every response is validated with the same Zod schema in both modes. Live mode (the default) calls the backend's `/api/v1` endpoints; mock mode is explicit opt-in for demos and Playwright runs.

```sh
GTF_API_MODE=live                            # or mock (synthetic fixtures; demos/tests only)
GTF_API_BASE_URL=http://127.0.0.1:4000       # gtfhrbackend API
GTF_SESSION_COOKIE=gtf-session               # httpOnly cookie carrying the API session
GTF_API_TIMEOUT_MS=10000
GTF_MOCK_LATENCY_MS=0                        # mock only: simulate network latency
```

The live transport sends `Idempotency-Key` and `If-Match` headers where the contract requires them and maps `application/problem+json` errors to field errors.

### Account invites and email

HR adds an employee with their real work email; this becomes their login ID. The backend emails a single-use, expiring set-password link; HR never creates, sees or sends the password (pwd.md). Email is sent through `SMTP_URL`/`MAIL_FROM` in `gtfhrbackend/.env`; without `SMTP_URL` messages are only logged (development). Keep these values server-side, never in browser variables or source control, and test with an address you control before inviting staff.

## Frontend architecture (paths relative to `gtfhrfrontend/`)

```text
app/                              Server pages (no "use client"), loading/error boundaries, route handlers
  (workspace)/<module>/page.tsx   Authenticated pages; each checks its capability
  api/                            Photo delivery and CSV export (permission rechecked per request)
  manifest.ts, offline/           PWA manifest and the data-free offline page
components/
  ui/                             Stateless primitives (DataTable, Sheet, Avatar, StatCard, Alert, …)
  sections/<module>/              Page layouts from resolved, typed props
  features/<module>/              Client controllers (forms, sheets, optimistic toggles)
  features/pwa/                   Install prompt, service worker, permissions, camera
hooks/                            Client hooks: useCommand, useDisclosure, useGeolocation, useCamera,
                                  usePermissionState, useInstallPrompt, useOnlineStatus, useLiveMinutes, …
  leave/                          Module hooks (useLeaveEstimate)
lib/
  api/core/                       Transport, config, problem types (the mock ↔ live seam)
  api/<module>/                   Server-only services, one per module
  actions/<module>.ts             Server actions: validate → service → refresh
  mocks/seed/                     Synthetic fixtures (org, people, calendar, extended records)
  mocks/handlers/<module>.ts      Mock backend per module, with scope and server rules
  mocks/store.ts                  In-memory store (versioned, rebuilt on a new day or shape change)
  navigation.ts                   Capability → navigation projection (usability only)
  utils/                          Exact money/date formatting, status tones
types/<module>.ts                 Zod contracts shared by mock, live transport and UI
tests/                            Playwright end-to-end, accessibility and PWA checks
```

Read/write path: `page.tsx or server action → services/api (typed HTTP client) → gtfhrbackend REST API → PostgreSQL`. `GTF_API_MODE=mock` swaps the HTTP client for synthetic in-process fixtures (demos and Playwright only).

Rules enforced by lint: components and hooks cannot import `lib/api`, `lib/mocks` or call `fetch`. Every color is a CSS token (see `app/globals.css`); the web manifest is the one documented exception, because the OS reads it before any CSS loads. Phones use a native-app type scale via `--fs-*` tokens.

## Modules

Home · Engage · Salary (payslips, YTD, IT statement, IT declaration, loans, reimbursement, revision) · Leave (apply, team calendar, holidays) · Attendance (capture with optional location, regularization, permission, team) · Document center (+ letter requests) · People (directory, starred, org chart, profiles with photos) · Helpdesk (threads, HR queue, confidential routing) · Request hub · Approvals (leave, correction, permission, expense; delegation-aware) · Workflow delegates · Payroll (maker/checker run workbench) · HR admin (onboarding, announcements, reports and CSV) · Notifications · Settings.

## Installable app and device access

- **Install:** Android/Chrome/Edge get a native install sheet; iOS gets Add-to-Home-Screen steps. The same option is under Settings → GTF HR app.
- **Service worker** (production builds only): caches only hashed static assets, icons and `/offline`. Private pages, React payloads and `/api` are never cached.
- **Location:** read once, only when the user taps Check in with "Verify with my location" on. The server checks the site geofence through `lib/api/location` (mock today). If the user denies location, the punch still records and is flagged "Location not shared". There is no background tracking.
- **Camera:** starts only from "Take a photo"; the stream stops when the sheet closes.
- **Notifications:** requested from Settings; a test notification confirms delivery. Server push needs a VAPID key and push endpoint from the backend (not configured yet).

Browsers only allow location, camera and install over HTTPS or on `localhost`. To test on a phone, serve over HTTPS (for example a tunnel) or use `localhost` port-forwarding.

## Verification

```sh
pnpm check                                   # lint + strict typecheck + production build
pnpm build && pnpm start                     # production preview
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
node scripts/generate-pwa-icons.mjs          # regenerate icons from the original logo
```

Status, evidence and the remaining release gates are tracked in [completion/](completion/README.md).
