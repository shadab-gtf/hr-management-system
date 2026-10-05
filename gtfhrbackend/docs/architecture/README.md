# Backend architecture

## Layers

```text
HTTP request
  → src/app.ts                 request id → CORS → JSON body → routes → 404 → error handler
  → src/routes/index.ts        mounts every module router
  → modules/<m>/<m>.routes.ts  middleware chain: authenticate → permission → validate → controller
  → <m>.controller.ts          reads validated input + actor, calls the service, writes { data, meta? }
  → <m>.service.ts             business rules, row scoping, transactions, audit; throws AppError subclasses
  → <m>.repository.ts          the only layer that talks to Prisma
  → PostgreSQL
```

Rules that keep the layers clean:

- **Controllers** contain no business rules and no Prisma calls.
- **Services** never touch `request`/`response`. They take the `AuthenticatedActor` explicitly and throw `AppError`
  (or `ValidationError`, `AuthenticationError`, `AuthorizationError`) for expected failures.
- **Repositories** take a Prisma client _or_ a transaction client (`TransactionClient`), so the same functions work inside
  `withTransaction()`. Writes that must commit together (row + role + audit) run in one transaction.
- **Errors** are turned into problem responses only in `core/middleware/error.middleware.ts`. Unknown errors are logged
  with the request id and an error code, never with payloads, tokens or passwords.
- **Config** is read and validated once in `src/config/env.ts`. Nothing else reads `process.env`.

## Folder map

| Path                              | Holds                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `src/config/`                     | validated environment (`env.ts`), database and logger settings                 |
| `src/core/errors/`                | `AppError` and its 400/401/403 subclasses                                      |
| `src/core/middleware/`            | request id, authentication, roles, validation, rate limit, 404 + error handler |
| `src/core/database/`              | Prisma client factory, `withTransaction()`                                     |
| `src/core/logger/`                | structured JSON logger                                                         |
| `src/core/security/`              | password hashing (bcrypt + SHA-256 prehash), access-token issue/verify         |
| `src/modules/<name>/`             | one bounded feature: `routes`, `controller`, `service`, `repository`, `schema` |
| `src/routes/index.ts`             | the single place a module router is registered                                 |
| `src/utils/`                      | response envelopes, cursor pagination, date helpers, constants                 |
| `src/types/express.d.ts`          | `request.actor` and `request.requestId` typings                                |
| `prisma/`                         | schema, migrations, development seed                                           |
| `scripts/`                        | one-off operational commands (`bootstrap-hr.ts`)                               |
| `tests/unit`, `tests/integration` | pure functions; real HTTP app with an isolated migrated PostgreSQL database    |

## Adding a module

1. Create `src/modules/<name>/` with `<name>.schema.ts`, `.repository.ts`, `.service.ts`, `.controller.ts`, `.routes.ts`.
2. Register its router in `src/routes/index.ts` under `API_PREFIX`.
3. Add Prisma models and a migration (`pnpm db:migrate`), then audit sensitive writes with
   `modules/audit-logs/audit.repository.ts` inside the same transaction.
4. Add unit tests for rules and an integration test for auth, permission and validation failures.
5. Document the endpoints in `docs/api/README.md`.
