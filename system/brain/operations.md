# Operations and incident runbooks

Status: proposed service targets and runbooks · Owner: Operations Lead · Updated: 2026-09-28

## Service objectives

| Signal | Initial objective | Measurement / action |
| --- | --- | --- |
| Critical authenticated reads/writes | 99.9% monthly success availability | Successful service responses divided by valid attempts; expected 4xx excluded, dependency outages included |
| Ordinary API reads | p95 ≤400ms server time | By route and role cohort |
| Ordinary commands | p95 ≤800ms, excluding job execution | Separately report authentication/provider latency |
| Attendance acknowledgment | p95 ≤500ms at agreed peak | Durable receipt, not full day recomputation |
| Attendance processing lag | p95 ≤60s | Received event to visible derived day under normal load |
| Notification queue age | p95 ≤5 minutes | Separate provider failure from processing lag |
| Disaster recovery | Proposed RPO ≤15 minutes, RTO ≤4 hours | Demonstrated restore, not vendor marketing claims |

Targets require self-hosted architecture, hardware, staffing and recovery validation. A 99.9% target permits roughly 43 minutes of downtime in a 30-day month; it is not a guarantee. Define maintenance and outage attribution before launch; do not quietly exclude payroll-close outages. No measured SLO evidence exists yet. [Tech stack](tech-stack.md) specifies OSS services; there is no assumed managed-provider SLA or free unlimited hosting.

## Observability and alerts

Collect availability, latency, 5xx rate, authorization failures, DB connection/lock time, slow queries, storage error rate, scan lag, queue depth/oldest age, payroll job state, reconciliation blockers, backup age, and restore-test age. Aggregate workforce metrics must not leak tiny-team compensation or identify individuals unnecessarily.

Initial page triggers: critical endpoint 5xx >5% for 5 minutes with sufficient sample volume; attendance oldest event >5 minutes; payroll job stalled >10 minutes without checkpoint; backup/PITR failure; suspected data exposure. Tune after pilot, using both short- and long-window SLO burn rates. Route business validation spikes to domain owners rather than paging infrastructure for every rejected leave request.

Dashboard/log links use correlation IDs and safe resource references, never employee names or salary amounts. Central telemetry sampling/redaction applies to worker errors as well as HTTP requests. Alert delivery and acknowledgment are tested in staging and production readiness drills.

## Backup and recovery

Use self-hosted PostgreSQL WAL/PITR with pgBackRest and verified encrypted backup repositories. Back up private SeaweedFS data and associated metadata/configuration with a coordinated restic/snapshot strategy; validate versioning and recovery features in the selected OSS build rather than assuming Enterprise capabilities. Back up Keycloak, Forgejo and OpenBao recovery material under separate controlled procedures. Keep backups in a separate failure domain with approved location/retention. Backups without decryption keys and tested restore procedures do not count as recoverable.

Run a prelaunch restore into an isolated environment, then proposed quarterly drills and after major storage changes. Record exact backup timestamps, start/end time, recovered row/object counts, checksums, key access, application smoke tests, and achieved RPO/RTO. Do not attach restored production HR data to a public preview.

Recovery sequence: declare incident → stop affected writes/jobs → select restore point → restore DB/objects/config → verify integrity/tenant isolation → reconcile outbox and provider effects → reconcile approved payroll/payment references after restore point → replay deletion/retention ledger → obtain domain-owner sign-off → reopen writes → monitor. Because RPO may permit lost recent transactions, reconcile with durable external receipts and users before replay; never assume an exported or paid item was not processed.

## Incident severity and response

| Severity | Example | Initial response target |
| --- | --- | --- |
| SEV-1 | Data exposure, unauthorized payroll, widespread outage at payroll/attendance critical window | Acknowledge within 15 minutes; incident commander and Security/Finance engaged |
| SEV-2 | One major domain unavailable, growing durable job backlog | Acknowledge within 30 minutes; assigned domain owner |
| SEV-3 | Limited degraded feature with safe workaround | Business-hours triage within one working day |

Targets assume funded coverage; staffing/on-call roster must be named before production. Incident commander assigns technical lead, communications owner, and business owner. Keep a timestamped decision log. Security/Privacy determine applicable employee/regulatory notification obligations and deadlines from current law; do not send uncontrolled notifications from logs.

## Specific runbooks

**Payroll failure:** freeze approval/publication, retain failed run/input digest, inspect safe validation details, compare last successful checkpoint, fix cause, create a new preapproval revision or retry artifact rendering idempotently after approval. Finance revalidates impact. Never edit result rows manually.

**Attendance source outage:** mark source stale, preserve durable queue, notify HR, enable the approved manual regularization route, backfill from overlapping source windows, deduplicate, and review any effect on frozen payroll separately.

**Compromised account/key:** revoke sessions/token grants, disable integration or role, rotate affected keys, preserve audit evidence, identify accessed resources/exports, assess scope, and review restoration of rights. Do not erase logs during containment.

**Bad release:** disable the affected feature, halt incompatible workers, assess schema compatibility, roll back to the prior immutable artifact, run permission/critical-flow smoke checks, and reconcile in-flight jobs. If schema is not backward compatible, follow the tested forward-fix/recovery plan; never blindly run a destructive down migration.

**Failed document scan/storage:** keep documents quarantined, pause previews/publication, retry infrastructure failures with bounded policy, reject unsafe files, and notify only affected authorized users. Never bypass scanning to clear a queue.

## Release and ongoing governance

Use expand → backfill → switch → contract migrations across multiple releases. One migration runner obtains an advisory lock; startup replicas do not all migrate concurrently. Capacity reviews consider real peak patterns, DB indexes, worker concurrency, storage growth, and cost. Schedule maintenance away from payroll cut-off and attendance peaks.

Maintain named owners, support channel, escalation tree, vendor contacts, region inventory, access reviews, retention jobs, key rotation, vulnerability patch cadence, and incident postmortems. Reports on completed work reference evidence in [completed list](completed-list.md); [production checklist](production-checklist.md) is the launch gate.
