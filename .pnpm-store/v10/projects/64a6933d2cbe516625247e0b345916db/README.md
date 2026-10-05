# GTF HR backend

Standalone Node.js 22, strict TypeScript, Express 5, Prisma 6 and PostgreSQL API for ../gtfhrfrontend. Frontend server adapters use authenticated HTTP; production code has no Next.js, Supabase or legacy dependency.

## Modules

| Area          | Implemented workflows                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Identity      | Password login, single-use invitation/recovery, TOTP MFA, session revocation, role grants, account disable/enable, audit                |
| People        | Directory, private profile changes and verification, employee creation/assignments, org chart, departments/locations, photos, favorites |
| Attendance    | Check-in/out, geolocation, regularization, rules/sites/shifts, rosters/swaps, CSV/XLSX import                                           |
| Leave         | Policies, balances, requests/approvals, holidays/calendar, comp-off, encashment, year-end                                               |
| Workflows     | Approval inbox, delegation, expenses, projects, timesheets, request tracking                                                            |
| Payroll       | Compensation imports/structures, calculation/review/approval/payment, payslips, loans, declarations, Form16, statutory exports          |
| Talent        | Careers/applications/candidates, interviews/offers/referrals, performance cycles/goals/reviews/calibration/feedback                     |
| Lifecycle     | Onboarding/checklists, policies, assets, letters, resignation, clearance, settlement, employee exit                                     |
| Workplace     | Dashboard, helpdesk, documents, announcements/events/celebrations, feed/comments/reactions, polls/praise/surveys                        |
| Reporting     | Standard/custom reports, saved definitions, exports, schedules and deliveries                                                           |
| Notifications | Private inbox/read counts, preferences, phone OTP, SMTP outbox, report notifications                                                    |

See [HTTP contract](docs/api/README.md), [endpoint inventory](docs/api/endpoints.json), [time workflows](docs/api/time.md) and [architecture](docs/architecture/README.md).

## Development

Requires Node.js 22.20+, pnpm 10 and PostgreSQL 17/18.

```powershell
Copy-Item .env.example .env
# Configure DATABASE_URL, JWT_SECRET, JWT_ISSUER and JWT_AUDIENCE.
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:deploy
# Development database only; supplies synthetic staff and policies.
pnpm db:seed:dev
pnpm dev
```

The service listens on http://127.0.0.1:4000. /health is process liveness; /ready checks PostgreSQL. Seed passwords come only from DEV_SEED_PASSWORD. Development seed is never a production initialization step.

Configure the frontend .env.local and restart it:

```dotenv
GTF_API_MODE=live
GTF_API_BASE_URL=http://127.0.0.1:4000
```

Explicit mock mode remains available for demos/tests. The former supabase mode now resolves to the live API. Tokens stay in an HTTP-only cookie and are forwarded only by frontend server adapters.

## Production initialization

1. Provision a dedicated PostgreSQL database. Configure production environment variables, a stable random 64-character hexadecimal ENCRYPTION_KEY, a separate random JWT_SECRET, the frontend HTTPS URL and restricted CORS origin.
2. Run pnpm db:deploy. Migrations in prisma/schema/migrations include ownership foreign keys and immutable audit/payroll constraints.
3. Use the organization-only JSON bootstrap with real organization, department, location, probation and initial shift configuration, then bootstrap the first HR account. See scripts/bootstrap-organization.ts, config-examples/organization.json and scripts/bootstrap-hr.ts. They create no demo employees.
4. Sign in and enroll an authenticator. Privileged permissions require verified MFA by default. Configure sites, leave policies, approved statutory rates, payroll entities/profiles and opening compensation before processing pay. Use the validated payroll provisioning CLI for inputs not exposed in existing frontend forms.
5. Configure SMTP, SMS and the file scanner as needed, then run pnpm build and pnpm start. See .env.example for adapter protocols. BACKGROUND_JOBS_ENABLED=false disables scheduling/delivery for maintenance and tests.

The existing local database credentials are not replaced by this implementation. Sandbox verification does not certify access to the separately configured database or external providers.

## Files and background work

Private document bytes persist in PostgreSQL and remain quarantined until the configured scanner returns { "clean": true }. Unavailable scans cannot release files; rejected bytes are deleted. Authorization is checked again at download. Photos accept validated JPEG/PNG bytes.

The worker processes due reports, durable SMTP outbox rows and pending scans. SMTP retries back off exponentially and stop after five failures. Mail remains queued without SMTP; tokens, OTPs and message bodies are never printed. At-least-once delivery remains possible if a process exits after provider acceptance but before commit; SMTP message IDs are stable.

In-app notifications need no provider. Phone OTP requires the configured HTTP SMS adapter. Channel/quiet-hour/digest preferences persist; push/WhatsApp delivery infrastructure is not provisioned by this repository.

## Validation

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# Needs a PostgreSQL role that can create dedicated disposable databases.
pnpm test:integration
```

Integration tests deploy real migrations into independent gtf_hr_sb_* databases and call actual HTTP endpoints. They test frontend DTO compatibility, authorization, ownership, idempotency, concurrency, encrypted data, MFA/recovery, file access, payroll/leave ledgers and lifecycle transitions. They never reset the database named directly in DATABASE_URL.

Tests deliberately load frontend DTOs for compatibility verification; production source and build remain standalone.

## Layout

```text
src/config/                 validated environment
src/core/                   errors, middleware, security, transactions, logging
src/contracts/              standalone wire DTOs and validators
src/modules/<feature>/      routes → controller → service → repository
src/routes/index.ts         module registration
prisma/schema/              schema files and deployable migrations
prisma/sql/                 integrity constraints included in migrations
scripts/                    bootstrap, provisioning, sandbox and audit
tests/                      unit and PostgreSQL integration suites
```

Payroll amounts use integer paise; jurisdiction-specific rates come from approved configuration. Review the organization's policy values and financial year before live payroll/statutory submission.
