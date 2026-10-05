# Building a feature module

The API exists to serve the frontend in `gtfhrfrontend/` with `GTF_API_MODE=live`. Every frontend call goes through
`callApi({ schema, live, mock })` in `gtfhrfrontend/services/api/<area>/*.service.ts`; the `live` object is the HTTP
contract this service must implement, and `schema` (from `gtfhrfrontend/types/*.ts`) is the exact response shape.

## 1. The contract you implement

For every `callApi` in the frontend service:

| `live` field          | Meaning for the API                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ |
| `path`                | Route under `/api/v1` (e.g. `/leave/requests/:id/cancel`)                             |
| `method`              | Default `GET`; commands are `POST`, edits `PATCH`                                     |
| `query`               | Query-string parameters (strings; coerce in the Zod schema)                           |
| `body`                | JSON body                                                                             |
| `list: true`          | Respond `{ data: T[], meta }` with `sendList()`; the item type is the list schema's item |
| `idempotencyKey`      | Arrives as `Idempotency-Key`; wrap the command in `idempotent()`                      |
| `ifMatch`             | Arrives as `If-Match: "<version>"`; check with `assertVersion()` (412 `STALE_VERSION`) |
| otherwise             | Respond `{ data: T }` with `sendData()`                                               |

The response must pass the frontend's Zod schema unchanged. The business rules to reproduce are in the mock handler
the service calls (`gtfhrfrontend/lib/mocks/handlers/*.ts`): every `requireCapability`, row-scoping rule, validation,
`problem(status, CODE, message)`, `versionCheck`, `idempotent` and notification. Use the same codes and messages.

## 2. Files

```text
prisma/schema/<module>.prisma        models + enums for this module only
prisma/sql/<NN>-<module>.sql         optional: idempotent CHECKs/triggers Prisma cannot express
prisma/seeds/<NN>-<module>.ts        dev seed from prisma/seed-data/mock-store.json (re-runnable)
src/modules/<module>/
  <module>.routes.ts                 router: authenticate → requirePermission → validate → controller
  <module>.controller.ts             HTTP only: read validated input/actor/headers, call service, send
  <module>.service.ts                rules, row scoping, transactions, audit, notifications
  <module>.repository.ts             all Prisma access (takes a client or a TransactionClient)
  <module>.schema.ts                 Zod input schemas (body/query/params)
  <module>.mapper.ts                 optional: DB row → contract DTO
  <module>.rules.ts                  optional: pure business rules (unit-tested)
tests/unit/<module>/*.test.ts        pure rules
tests/integration/<module>/*.test.ts every endpoint against a seeded sandbox
docs/api/<module>.md                 endpoint table (method, path, capability, notes)
```

Register the router in `src/routes/index.ts` (one line). Large areas may split into several module folders.

## 3. Platform you build on (do not re-implement)

| Need                         | Use                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Caller                       | `authenticate`, `currentActor(request)` → `{ employeeId, roles, capabilities }`       |
| Permission                   | `requirePermission("leave.request.self")` (route) or `requireCapability(actor, …)`   |
| Input validation             | `validate("body" | "query" | "params", schema, { message, fieldErrors: true })`, `validated()` |
| Errors                       | `ValidationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `PreconditionFailedError`, `AppError(status, code, msg)` |
| Transactions                 | `withTransaction(prisma, tx => …)`                                                    |
| Idempotent commands          | `idempotent(prisma, { actorId, key: idempotencyKeyOf(request), command }, tx => …)`   |
| Optimistic concurrency       | `expectedVersionOf(request)` + `assertVersion(row.version, expected)`; bump `version` |
| Audit                        | `recordAuditEvent(tx, {...})` in the same transaction as the change                   |
| Notifications (+ realtime)   | `notify(tx, { employeeId, kind, title, body, href })` — published on commit          |
| Email                        | `queueEmail(tx, {...})` — links only, never passwords (pwd.md)                        |
| Files                        | `rawUpload()`, `uploadedFile()`, `saveFile(tx, …)`, `loadFile(tx, id)`                |
| Ids / references             | `newId("lv")`, `nextReference(tx, "LV", todayInOrgZone())`, `nextEmployeeId(tx)`      |
| People in responses          | `personRefSelect` + `personRef()`                                                    |
| Money                        | integer paise in the DB (`BigInt` for amounts that can exceed ₹2 crore), `inr(paise)` on the wire |
| Dates                        | `todayInOrgZone()`, `addDays`, `zonedInstant`; `@db.Date` for business dates          |
| Responses                    | `sendData`, `sendList`, `sendNoContent`, `sendCsv(toCsv(...))`                        |

## 4. Rules

- **Schema**: model and enum names start with the module's prefix (`Leave…`, `Pay…`) so files never collide; tables
  are `@@map`ped to snake_case with the same prefix. Ids are text (`newId(prefix)` or the seed's ids). Money is integer
  paise. Mutable workflow rows have `version Int @default(1)`. Index foreign keys and common filters. Reference
  employees with a relation to `Employee` (add the back-relation line inside the marked block in `core.prisma`) and
  other modules' rows by plain id. Do not change existing fields in `core.prisma`.
- **Security**: authorize before reading data; scope rows (employee → own, manager → direct reports, HR/payroll by
  capability); never return salary/bank/tax fields to callers without the capability; maker ≠ checker where money or
  records change; no self-approval. Never log payloads, tokens or personal data.
- **Correctness**: business dates in Asia/Kolkata (`todayInOrgZone()`), never `toISOString().slice(0, 10)` for "today".
  Every write that changes state writes an audit row in the same transaction.
- **Tests**: every endpoint has an integration test that validates the response with the frontend schema
  (`tests/helpers/contract.ts`), plus denial (403), validation (400 with fieldErrors), not-found, and for commands
  idempotent replay and 412 on a stale version where the contract sends `ifMatch`.

## 5. Commands

```powershell
pnpm exec prisma format; pnpm exec prisma generate     # after editing a .prisma file
pnpm db:sandbox <name> --reset --seed-only=<module>     # private seeded database from the current schema
pnpm db:sandbox <name> -- pnpm exec tsx --test tests/integration/<module>/*.test.ts
pnpm exec tsx --test tests/unit/<module>/*.test.ts
pnpm typecheck; pnpm exec eslint src/modules/<module> tests prisma --max-warnings=0
```
