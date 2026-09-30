# GTF HR · web frontend

Next.js App Router frontend for GTF Technologies' HR platform. It is a complete, role-based product UI, mobile-first and installable as an app (PWA). It runs against a **synthetic mock backend** today and switches to the real HR API with one environment variable. No live employee data, payroll or authentication exists yet.

## Run locally

Use Node 22.20.0 and pnpm 10.33.2.

```sh
pnpm install --frozen-lockfile
pnpm dev                 # http://127.0.0.1:3000
```

Sign in with a demo profile. Each profile has a different role:

| Profile | Roles | Sees |
| --- | --- | --- |
| Employee | employee | Self-service: attendance, leave, salary, documents, helpdesk, requests |
| HR operations | employee, manager, HR operator | + People admin, team approvals, delegates, HR queue, onboarding, announcements, reports |
| Payroll operator | employee, payroll operator | + Payroll preparation and submission (cannot approve own run), reports |
| Finance approver | employee, manager, payroll approver | + Independent payroll approval and publication, team approvals, reports |

Mock data is in memory. It resets on restart and is rebuilt daily, relative to today's IST date.

## Switching to the real API

Pages never know which backend served them. Every read and command goes through `lib/api/<module>/<module>.service.ts` → `lib/api/core/transport.ts`. That transport either calls the mock handler or the real `/api/v1` endpoint, and it validates **both** with the same Zod schema.

```sh
GTF_API_MODE=live
GTF_API_BASE_URL=https://hr-api.internal     # serves /api/v1/...
GTF_SESSION_COOKIE=gtf-session               # forwarded to the API
GTF_LOGIN_URL=https://sso.internal/login     # sign-in redirect in live mode
GTF_API_TIMEOUT_MS=10000
GTF_MOCK_LATENCY_MS=0                         # mock only: simulate network latency
```

Each service lists its live path next to its mock twin, so the backend contract is readable in one place. Once every endpoint exists, `lib/mocks/` and the `mock:` branches can be deleted without touching pages or components. The live transport already sends `Idempotency-Key` and `If-Match` headers where the contract requires them, and maps `application/problem+json` to field errors.

## Architecture

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

Read path: `page.tsx → lib/api service → (mock handler | /api/v1) → section → ui`.
Write path: `feature form → lib/actions → lib/api service → refresh()`.

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
