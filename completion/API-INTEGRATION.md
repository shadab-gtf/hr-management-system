# Frontend ↔ backend integration

Updated 2026-10-05.

Final verified status and remaining activation/functional work: [BACKEND-STATUS.md](BACKEND-STATUS.md).

The Next.js frontend calls the standalone Express/Prisma/PostgreSQL backend through gtfhrfrontend/services/api. Live is the default. Direct Supabase/legacy runtime adapter imports have been removed; browser components receive no bearer token or database credential.

## Coverage

Registered modules cover identity/access/MFA, profiles/directory/org chart, attendance/roster/imports/location, leave/comp-off/encashment/year-end, approvals/delegations/expenses/timesheets, compensation/structures/payroll/statutory/payslips/loans/declarations/Form16, recruitment/performance, onboarding/assets/policies/letters/resignation/settlement, reports/schedules/exports, dashboard/helpdesk/files/announcements/events, engagement/polls/praise/surveys and notifications/preferences.

The runtime audit compares frontend HTTP operations with registered Express method/path pairs. Current inventory: gtfhrbackend/docs/api/endpoints.json. Reproduce using gtfhrbackend/scripts/audit-frontend-routes.ts. Route coverage is separate from behavioral testing.

## Behavior

- HTTP-only session cookie, live role/account checks, MFA and revocation.
- Validated requests/responses, centralized errors, role/team/owner authorization.
- Transactional audit, workflow state and ledger changes.
- Idempotency and record versions guard retries/stale edits.
- Sensitive bank/PAN/phone/authenticator fields are encrypted at rest.
- Actual file/import bytes reach the backend; documents remain quarantined pending scanning.
- Payroll/statutory exports use persisted approved data and configured policies.
- Explicit mock mode is available for demos/tests and never substitutes for a failed live API.

## Setup and verification

See gtfhrbackend/README.md for deployment, organization/HR bootstrap, payroll provisioning and environment variables. Production bootstrap is separate from synthetic development seed.

Set frontend GTF_API_MODE=live and GTF_API_BASE_URL=http://127.0.0.1:4000, then restart. A valid backend DATABASE_URL, secrets and organization configuration are required. SMTP/SMS/antivirus endpoints need their own provider setup.

Backend verification includes strict typecheck, lint, unit tests, build and HTTP integration suites against independently migrated PostgreSQL databases. Frontend verification includes lint, generated route types, TypeScript and production build. Database suites load real frontend DTOs. A live browser smoke exercises the production frontend against an isolated seeded backend.

The existing machine's configured database rejected its credentials during verification. Tests use a separate disposable local PostgreSQL cluster; no persistent target database or credentials were overwritten.
