# Error handling

Status: required reliability contract · Owner: Engineering + Operations · Updated: 2026-09-28

## Failure taxonomy

| HTTP / domain code | Meaning | User recovery | Retry behavior |
| --- | --- | --- | --- |
| 400 `INVALID_REQUEST` | Malformed body/cursor/filter | Correct request | Never automatic |
| 401 `AUTH_REQUIRED` | Missing/expired/revoked session | Sign in; revalidate command | Never replay sensitive command blindly |
| 403 `FORBIDDEN` | Known action outside scope | Safe denial/contact responsible owner | No |
| 404 `NOT_FOUND` | Absent or deliberately concealed resource | Return to accessible list | No |
| 409 `LEAVE_BALANCE_INSUFFICIENT` | Available balance changed or insufficient | Review latest balance | No |
| 409 `WORKFLOW_ALREADY_DECIDED` | Another decision won | Display current state | No |
| 409 `PERIOD_LOCKED` | Closed inputs/period | Create approved adjustment | No |
| 409 `IDEMPOTENCY_CONFLICT` | Same key with different payload | Correct client/request key handling | No |
| 409 `COMMAND_IN_PROGRESS` | Matching command still running | Wait/check authoritative result | Same key after guidance |
| 412 `VERSION_CONFLICT` | Stale If-Match | Reload and review changes | No blind merge |
| 422 `VALIDATION_FAILED` | Valid structure but invalid fields/rules | Inline field correction | No |
| 428 `PRECONDITION_REQUIRED` | Missing concurrency guard | Fetch current resource | No blind mutation |
| 429 `RATE_LIMITED` | Request budget exceeded | Wait specified period | Respect Retry-After |
| 503 `DEPENDENCY_UNAVAILABLE` | Required service temporarily unavailable | Try later / support reference | Bounded, idempotent only |
| 500 `INTERNAL_ERROR` | Unexpected fault | Generic message and request ID | No mutation retry without key/status check |

Document scanning rejection uses `DOCUMENT_UNSAFE`; no retry of the same malicious object. Payroll calculation failure records `PAYROLL_CALCULATION_FAILED` with restricted diagnostic reference, never partial published totals. All errors conform to [API contract](api-contract.md).

## Next.js boundaries

Root `loading.tsx` reserves the shell/content geometry. Each data-bearing route has a route-specific skeleton in `loading.tsx`, an explicit Suspense fallback for each independently streamed region, and `error.tsx`. Framework error boundaries are client components for reset interaction; pages remain server-only. Root layout failures require `global-error.tsx` with its own minimal `html`/`body` and safe fallback styling.

Boundary UI shows safe context, retry when meaningful, navigation to a working page, and support reference. Do not expose framework exception strings. Handle expected form/domain failures as typed results, not thrown errors that wipe out entered data. Correctly preserve framework redirect/not-found behavior rather than catching it as a generic exception.

Independent dashboard regions can show a local error while other sections work. Payroll approval blocks if any required totals, snapshot, or authorization read fails. A failed balance read never renders zero as a real balance. Skeleton disappearance must not collapse layout or move the primary control.

## Client command semantics

Disable repeat submission only while pending; the server still enforces idempotency. Display “Submitting…” with stable geometry. If network response is lost, show “Confirmation pending” and retrieve/re-enter the authorized page state before creating another command. Reuse the original key for an intentional retry of the same command. Never claim a punch, leave approval, or payment completed based on a click alone.

Keep ordinary invalid form inputs in memory during correction. Sensitive bank/tax/password values must not be saved to localStorage, URL query strings, telemetry, or automatic offline drafts. On session expiry, preserve only non-sensitive draft state as explicitly permitted and ask for re-entry of restricted fields.

## Retry and job policy

Synchronous reads may retry once for a transient failure within the route time budget. Worker baseline: maximum five attempts, exponential backoff with jitter starting at 10 seconds and capped at 15 minutes; source-specific Retry-After takes precedence. Validation/authentication errors go directly to failure. Store attempt count, next attempt, safe error code, and correlation reference.

After exhaustion, place the job in a dead-letter state/queue and alert its domain owner. An operator may replay only after diagnosing the cause and preserving the same business identity/idempotency guarantees. Lease expiry triggers safe reclamation; a worker crash cannot lose committed outbox messages. Duplicate notification delivery is prevented by a provider/message key where possible; do not claim exactly-once external delivery without provider support.

## Degradation and support

Mail failure does not roll back a successfully saved request; display request status and retry notification. Object-storage failure prevents document publication while other HR pages stay usable. Missing attendance-source data surfaces a freshness warning and HR reconciliation queue. Identity-provider failure never activates an insecure fallback login. Database unavailability fails writes closed and shows a service notice.

Every error has one correlation ID propagated through page/action/API/job logs. Log safe error classes and resource references only. Alert on error-rate/queue-age thresholds from [operations](operations.md), not every expected validation failure. Support can inspect job and transition history without unrestricted employee documents.

## Verification

Inject timeout, 429, provider 5xx, DB deadlock, lease expiry, expired session, duplicate clicks, stale versions, missing documents, malicious files, and loss of response after commit. Verify safe recovery, no duplicate financial posting, no raw secrets in errors, keyboard focus on form failures, and matching route/global fallback states.
