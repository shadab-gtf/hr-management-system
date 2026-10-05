# HTTP API contract

Application routes are under /api/v1. See [registered endpoint inventory](endpoints.json) and [time workflows](time.md).

## Authentication

POST /api/v1/auth/login accepts { "email": "…", "password": "…" } and returns a 15-minute bearer token. Frontend server adapters forward it from an HTTP-only cookie. The API reloads active roles, employment state, account status and revocation cutoff on each request.

Use /me/security/mfa-gate, /me/security/mfa/enroll and /me/security/mfa/verify for a verified session. Privileged roles require verification by default. An enrolled authenticator also gates ordinary data access until verified.

Public careers reads/application submission, auth recovery/setup and health endpoints are the authentication exceptions. Remaining modules enforce role, self/team or resource ownership checks. Anonymous surveys suppress small groups.

## Requests

- JSON input is validated at the HTTP boundary.
- Send Idempotency-Key on create/submit/approve/import/payment commands to replay committed responses after transport retries. Keys belong to an actor and operation.
- Send If-Match: "<version>" when the frontend supplies a record version. Stale writes return 412 STALE_VERSION.
- Employee directory supports cursor/limit and q, department, location and status filters.
- Document/photo uploads accept { "mime": "application/pdf", "contentBase64": "…" }; attendance imports accept { "fileName": "…", "contentBase64": "…" } and compensation imports accept { "fileName": "…", "base64": "…" }. Upload routes have explicit limits; other JSON remains limited to 1 MiB.

## Responses

Success: { "data": … }. Paginated directory results also include meta: { requestId, hasMore, total, nextCursor }. Binary downloads/CSV use their content type and disposition. Frontend adapters validate JSON results with the UI's Zod contracts.

Failures share the problem envelope:

```json
{
  "type": "urn:gtf:problem:validation-error",
  "title": "Employee details are invalid.",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "requestId": "request-identifier",
  "retryable": false,
  "fieldErrors": [{ "field": "workEmail", "code": "INVALID", "message": "Invalid email address" }]
}
```

| Status    | Meaning                                                   |
| --------- | --------------------------------------------------------- |
| 400 / 422 | Invalid fields, relationships or workflow input           |
| 401       | Missing, expired or revoked credentials                   |
| 403       | Insufficient permission or MFA required                   |
| 404       | Missing or inaccessible resource                          |
| 409       | Conflict, duplicate/completed workflow or file quarantine |
| 412       | Stale version                                             |
| 413       | Payload exceeds route limit                               |
| 429       | Rate/attempt limit                                        |
| 503       | Required configuration/provider/database unavailable      |

Responses carry X-Request-Id, Cache-Control: no-store and X-Content-Type-Options: nosniff. Supply an alphanumeric request ID to correlate logs without logging HR payloads.

## External delivery adapters

SMS_GATEWAY_URL receives POST { "to": "+91…", "message": "…" } with an optional bearer token. Non-2xx means delivery failed. OTPs expire after five minutes, are single-use, have bounded attempts and are never returned by live APIs.

FILE_SCANNER_URL receives raw bytes as application/octet-stream and X-File-Sha256. It must return { "clean": true | false }. An optional token is a bearer header. Unavailable/invalid responses leave files quarantined.

SMTP uses the durable transactional outbox. Scheduled reports recheck the owner's current permissions before execution; delivery downloads recheck ownership.
