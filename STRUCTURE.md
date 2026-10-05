# Repository structure

The repository root is a container for two child applications. Each has its own package manifest, lockfile and
runtime; run `pnpm` commands from the child project you are working on.

```text
HrManagementSytem/
  gtfhrfrontend/                 Next.js application (UI only; no database access)
    app/                         routes, layouts, loading/error states, file-download route handlers
    frontend/components/         UI primitives, sections, client feature controllers
    services/api/                typed HTTP clients for the backend API (+ mock transport for demos/tests)
    lib/actions/                 server actions: validate forms, call services/api
    lib/mocks/                   synthetic fixtures used only when GTF_API_MODE=mock
    middleware/, proxy.ts        optimistic session redirect/refresh
    types/                       Zod contracts shared by the UI, the HTTP clients and the backend's contract tests
  gtfhrbackend/                  Standalone Node.js 22 + TypeScript + Express 5 + Prisma 6 + PostgreSQL API
    src/
      config/, core/             validated env; errors, middleware, database, security, storage, mail, logger
      modules/<feature>/         routes → controller → service → repository (+ schema, rules, mapper)
      routes/index.ts            module registration
      utils/                     responses, pagination, money, dates, CSV
    prisma/                      schema folder, migrations, SQL constraints/triggers, development seed
    scripts/                     local DB setup, sandbox, bootstrap, payroll provisioning, route audit
    tests/                       unit and PostgreSQL integration suites
    docs/                        architecture, API reference, decisions, database
  completion/                    integration status and delivery evidence
  system/brain/                  product and engineering source of truth
```

## Request path

```text
gtfhrfrontend page or server action
  → services/api (callApi: Zod-validated HTTP client; bearer token from the httpOnly session cookie)
  → gtfhrbackend /api/v1/<route> → controller → service (rules, transactions, audit) → repository (Prisma)
  → PostgreSQL
```

`GTF_API_MODE=live` (default) uses the backend at `GTF_API_BASE_URL`. `GTF_API_MODE=mock` swaps in the synthetic
fixtures in `lib/mocks` for demos and Playwright runs only.

## Boundaries

- The frontend never imports backend code, database clients or secrets; the backend never imports frontend code at
  runtime (its contract tests read `gtfhrfrontend/types` to prove responses match what the UI validates).
- Authorization is enforced in the backend on every request (roles and account state re-read from the database);
  frontend checks only shape the UI.
- The earlier Supabase-coupled backend was removed on 2026-10-05 after every operation was ported; a zip backup is at
  `C:\shadab-2026\gtf-legacy-backup-2026-10-05.zip` (outside the repository).

See [gtfhrbackend/README.md](gtfhrbackend/README.md) for backend setup,
[gtfhrbackend/docs/api/endpoints.md](gtfhrbackend/docs/api/endpoints.md) for every route, and
[completion/BACKEND-STATUS.md](completion/BACKEND-STATUS.md) for verification and remaining work.
