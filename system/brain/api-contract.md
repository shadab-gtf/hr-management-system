# API contract

Status: normative contract design, not a running API · Owner: API Lead · Updated: 2026-09-28

## Transport and identity

Prefix: `/api/v1`. JSON request/response bodies use UTF-8 and explicit content types. Publish an OpenAPI 3.1 document and generated TypeScript types in implementation task MT-008. Runtime schemas remain mandatory; generated types alone do not validate input.

Web uses secure HttpOnly SameSite session cookies plus framework/server-action protections and origin/CSRF checks on cookie-authenticated mutations. Native clients use OAuth authorization-code with PKCE and short-lived scoped bearer tokens; integrations use separately scoped service credentials. Validate issuer, audience, expiry, revocation, organization membership, and field/record permissions. Never accept client-supplied actor identity or organization scope without validating membership. CORS is a strict allowlist, not `*` with credentials.

All private responses use `Cache-Control: private, no-store`. Do not include private fields in pagination metadata or validation echoes. Opaque IDs do not replace authorization.

## Standard shapes

Single-resource success: `{ "data": { ... }, "meta": { "requestId": "..." } }`. Lists add `meta.nextCursor` (string or null) and `meta.hasMore` (boolean). Totals are optional and separately scoped. Mutation responses include the new resource `version` and `ETag` where concurrency applies. An empty DELETE returns 204 only for explicitly supported nonfinancial resources; ledger/financial deletion is not exposed.

Money: `{ "amount": "54000.00", "currency": "INR" }`. Business date: `YYYY-MM-DD`. Instant: RFC 3339 UTC; source timezone is a separate IANA identifier. No floating-point JSON amounts. States are documented enums; reject unknown mutation states rather than ignoring them.

Errors use `application/problem+json`:

```json
{
  "type": "urn:gtf:problem:leave-balance-insufficient",
  "title": "Leave balance is insufficient",
  "status": 409,
  "code": "LEAVE_BALANCE_INSUFFICIENT",
  "requestId": "req_example",
  "retryable": false,
  "fieldErrors": [{ "field": "units", "code": "EXCEEDS_AVAILABLE" }]
}
```

`fieldErrors` is optional. No raw exceptions, SQL, bank values, tax IDs, or unauthorized object-existence details. See [error handling](error-handling.md) for codes and UI recovery.

## Pagination, filters, concurrency

List default 25, maximum 100. Cursor is opaque, integrity-protected, and bound to organization, actor scope, filter hash, and stable sort key plus ID. Sort fields are explicitly allowlisted. Search text max 100 characters; attendance list date span max 92 days. Longer reports use async export jobs. Filters are schema-validated and parameterized; do not pass field names or SQL through unchecked.

PATCH and workflow decisions require `If-Match` from the last ETag. Missing precondition returns 428; stale version returns 412. State/business conflicts return 409. Sensitive changes also require step-up authentication and reason where policy specifies. Cursor/token integrity errors use safe 400 responses.

## Idempotency

Require `Idempotency-Key` on attendance ingestion, leave submission/decisions, import commit, payroll commands, expense settlement, and export creation. Key max 128 characters; UUID recommended. Bind to organization, actor/service, route, and normalized body digest. Same key+body replays the original status/body; changed body returns `IDEMPOTENCY_CONFLICT` (409); an in-progress command returns `COMMAND_IN_PROGRESS` (409 with retry guidance).

Store replay results for at least 72 hours as an initial operational policy, with financial uniqueness constraints retained beyond key expiry. Key expiry is never permission to create a duplicate payroll run, leave posting, event, or payment intent. A transaction claims the key and writes the effect atomically; concurrent requests cannot both execute. Authorization is rechecked before returning a stored response.

## Core resource matrix

All paths below are relative to `/api/v1`. “Scope” is in addition to active authentication/membership.

| Method and path | Contract summary | Scope / result |
| --- | --- | --- |
| GET `/me` | Safe identity and granted capabilities | Own; 200 |
| GET `/employees` | Cursor, query, status, department, location | Directory-safe or HR projection according to explicit permission; 200 |
| POST `/employees` | Employee code, names, employment, verified assignment refs | `employee.create`; 201 + Location |
| GET `/employees/{id}` | Field-filtered employee/employment history | Own/team/HR according to permission; 200 |
| PATCH `/employees/{id}` | Allowlisted editable fields, version, reason | `employee.update`; 200; private changes may create approval request |
| GET `/attendance/days` | Employment/date filters and derived exceptions | Own or scoped team; 200 |
| POST `/attendance/events` | Direction, event time, source event ID, source evidence | `attendance.capture.self` or scoped integration; 201/replay |
| POST `/attendance/regularizations` | Day ID, proposed times, reason | Own open-window or authorized HR; 201 |
| GET `/leave/balances` | Employment, as-of date; available/reserved/used | Own or authorized approver; 200 |
| POST `/leave/requests` | Leave type, dates, half-day/units selection, reason | Own active employment; 201 |
| POST `/leave/requests/{id}/cancel` | Reason, expected version | Requestor or authorized HR; 200 or cancellation workflow |
| GET `/approvals` | Pending workflow steps in actor scope | Assigned/delegated approver; 200 |
| POST `/approvals/{id}/decisions` | Approve/reject, reason, expected version | Eligible approver excluding requestor; 200 |
| POST `/documents/uploads` | Classification, owner ref, name, MIME, size, checksum | Authorized owner/classification; 201 upload grant |
| POST `/documents/{id}/complete` | Upload checksum and object version | Original authorized uploader; 202 scan job |
| GET `/documents/{id}/download` | No arbitrary storage key accepted | Current record+classification permission, clean scan; 200 streamed file |
| POST `/imports` | Source, template version, document ID | Scoped HR/Finance importer; 202 dry-run job |
| POST `/imports/{id}/commit` | Approved digest, expected version | Independent authorized reviewer; 202 |
| GET `/jobs/{id}` | State, counts, safe result refs | Job owner or explicit domain operator; 200 |
| POST `/reports/exports` | Approved report code and bounded filters | Report/export permission; 202 |
| GET `/reports/exports/{id}/download` | Recheck original scope against current rights | Owner/authorized auditor; 200 file or 410 expired |
| GET `/audit-events` | Bounded actor/time/resource filters | Read-only scoped auditor; 200 |

Document upload grants expire after five minutes and permit only one scoped object key, MIME, checksum, and max 10 MiB. Verify object metadata after upload; client assertions are insufficient. Completion does not imply scan success. Private downloads use an authenticated proxy; internal storage grants stay server-side so revocation takes effect on the next download request.

## Leave submission example

```json
{
  "leaveTypeId": "opaque_leave_type_id",
  "startDate": "2026-10-05",
  "endDate": "2026-10-06",
  "dayPortions": [
    { "date": "2026-10-05", "portion": "full" },
    { "date": "2026-10-06", "portion": "full" }
  ],
  "reason": "Personal leave"
}
```

The actor's employment is derived from the session for self-service. Server computes chargeable units from policy/calendar; client units are never financial authority. Response includes canonical days, exact units as a decimal string, workflow state, reservation reference, and version. Reject overlapping requests, inactive employment, invalid calendars, insufficient balance, or missing workflow configuration atomically.

## Payroll commands

| Method and path | Preconditions | Success |
| --- | --- | --- |
| POST `/payroll/periods/{id}/runs` | Operator scope; input cut-off reviewed; unique regular run revision | 202 with run/job IDs |
| GET `/payroll/runs/{id}` | Pay-group scope | 200 status, totals, validation counts, input digest |
| POST `/payroll/runs/{id}/submit-review` | All calculations complete; no blocking exceptions | 200 `in_review` |
| POST `/payroll/runs/{id}/approve` | Independent approver, MFA step-up, If-Match, approved digest | 200 `approved` |
| POST `/payroll/runs/{id}/publish` | Approved immutable digest; publication permission | 202; published after all required artifacts ready |
| POST `/payroll/runs/{id}/payment-exports` | Approved run, Finance export permission, verified bank versions | 202 export job |
| POST `/payroll/payment-batches/{id}/reconcile` | Valid acknowledgment, Finance scope, expected version | 200 reconciled/partial/failed |
| POST `/payroll/adjustments` | Original result, target period, exact lines, reason, approval path | 201 draft adjustment |
| GET `/me/payslips` | Own linked employment | 200 published artifacts only |

Published payroll is never editable through PATCH. Payment exports do not initiate transfers. A missing/unknown acknowledgment never sets `paid`. [Payroll rules](payroll-rules.md) owns state transitions and reconciliation invariants.

## Later-phase resources

Helpdesk: `/tickets` and `/tickets/{id}/messages`; expenses: `/expenses`, `/expenses/{id}/submit`, `/expenses/{id}/settlements`; performance: `/performance/cycles`, `/performance/reviews`; recruitment: `/recruitment/candidates`, `/recruitment/applications`; lifecycle: `/lifecycle/cases` and `/lifecycle/tasks`. Their schemas must be added to OpenAPI and approved before implementation; resource names alone are not permission to invent business rules. Common security, versioning, errors, and idempotency rules apply.

## Jobs, limits, and compatibility

202 responses return `{data:{jobId,status:"queued"},meta:{requestId}}` plus a Location header to `/jobs/{id}`. Job states: queued, running, succeeded, failed, cancelled. Result artifacts become visible only at success. Web status refresh re-enters the page-owned data path; components do not poll APIs directly. Native clients poll centrally with bounded backoff.

Initial rate policies: reads 120/minute/actor, mutations 30/minute/actor, exports 5/hour/actor with one running, integration attendance 100/second/organization with a 200-event burst. Authentication limits are IdP-controlled. Tune against measured real usage; return 429 with Retry-After and audit abnormal patterns. JSON body max 1 MiB; bulk imports use the upload flow.

Breaking field/state/semantic changes require a new major API version and migration notice. Additive fields remain compatible; consumers must handle unknown read-only enum values safely. Publish deprecation dates after client inventory and at least a proposed 90-day migration window. Contract tests cover web actions and API handlers against shared services. External events carry event ID, schema version, organization reference, aggregate ID/version, occurred time, and minimal payload; authenticated webhooks have replay protection and independently rotating secrets.
