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
