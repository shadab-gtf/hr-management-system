# Backend decisions

Product-wide decisions (ADR-001 onward) live in [`system/brain/decisions.md`](../../../system/brain/decisions.md).
Record here only decisions that concern this service's internals.

## BE-001 — Layered feature modules (2026-10-05)

**Decision.** Each feature is a folder under `src/modules/` split into routes → controller → service → repository,
with shared cross-cutting code in `src/core/` and validated configuration in `src/config/`.

**Why.** It gives one obvious place for each concern: HTTP wiring, business rules, persistence. It keeps Prisma out of
controllers, makes services testable without Express, and lets new modules be added without touching existing ones
beyond one line in `src/routes/index.ts`.

**Consequences.** Every expected failure is an `AppError` subclass, and only the error middleware writes problem
responses. Repositories accept a transaction client so multi-row writes stay atomic.

## BE-002 — No Redis or field encryption until a feature needs it (2026-10-05)

**Decision.** `config/redis.ts` and `core/security/encryption.ts` are not created yet.

**Why.** Nothing in the service caches, queues or stores encrypted fields today; empty adapters would be untested code
paths. The login rate limiter is in-memory, which is correct for a single instance.

**Revisit when.** The API runs on more than one instance (move the rate-limit store to Redis), or payroll/bank fields
are migrated (add envelope encryption with a managed key).

## BE-003 — Deny-by-default access, super admin and department-wise permissions (2026-10-05)

**Decision.**

- Nobody has access until an administrator grants a role. Creating an employee, converting a candidate or inviting an
  account grants nothing; the one-time bootstrap creates the first `super_admin`.
- Roles: `employee` (own records), `manager` (own team), `hr_operator`, `payroll_operator`, `payroll_approver`, and
  `super_admin` (every capability, organization-wide).
- HR and payroll grants may be limited to departments (`role_scopes`). An unscoped grant is organization-wide. The
  employee and manager roles give no administrative reach and never widen a scoped grant.
- Every request re-reads grants and scopes from the database, so grants and revocations apply to the next request.
- Enforcement (`src/core/security/scope.ts`): when an HR/payroll/finance capability is used on ANOTHER employee's data,
  lists are filtered with `employeeScopeWhere`/`employeeIdsInScope` and single records are checked with
  `assertEmployeeInScope` (out-of-scope answers 404, so other departments cannot be probed). Organization-level actions
  (policies, settings, payroll runs, statutory filings, audit trail, organization-wide reports) use `requireOrgWide`.
- Granting (`src/modules/identity/access.rules.ts`): needs `access.manage` over the target's department; nobody changes
  their own access; only a super admin grants or revokes super admin; everyone else grants only roles they hold and
  never wider than they hold them; privileged changes need an MFA-verified session; the last super admin cannot be
  removed or disabled. Every change is audited and notifies the person.

**Why.** Least privilege and separation of duties: a department HR partner should not see other departments'
records, and no single account should be able to raise its own access. Maker ≠ checker and the self-approval ban
stay in the services, so even a super admin cannot approve their own payroll or requests.

**Consequences.** Modules must apply the scope helpers on every administrative read and command; integration tests
cover a department-scoped HR persona (`emp_0013`, Engineering) alongside the organization-wide personas.
