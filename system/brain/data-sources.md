# Data sources and migration

Status: proposed integration contract · Owner: Data Owner · Updated: 2026-09-28

## Authority register

| Source | Purpose | Authority / owner | Refresh and controls |
| --- | --- | --- | --- |
| HR-approved employee register | Identity, employment, organization | HR Operations | Initial migration + approved changes; employee code mapping |
| Identity provider | Authentication and account lifecycle | IT | Events + scheduled reconciliation; membership separate from login |
| Approved policy register | Leave, calendar, attendance, workflow | HR | Effective-dated publication, never scraped |
| Finance-approved pay register | Compensation, balances, deductions | Finance | Period cut-off, independent review, restricted import |
| Attendance devices/vendors | Raw clock events | HR + Integration Owner | Signed/credentialed ingestion; source ID and receipt timestamp |
| Employee-submitted forms | Requested profile/leave/expense changes | Employee, reviewed by responsible owner | Field validation; submission is not final authority |
| Bank/payment acknowledgment | Settlement outcome | Finance | File/API reconciliation, immutable reference |
| Official statutory publications | Rule research and version evidence | Finance/qualified reviewer | Check before rule activation and each payroll close |
| GTF public website | Company context and brand reference | Marketing/site owner | Manual research only; not employee or policy authority |
| Supplied logo | Visual brand source | User/Marketing | Preserved original; sampled palette in design system |
| Attached HR overview | Product discovery reference | User-supplied material | Feature inspiration; claims and examples unverified |

No connector credentials, biometric device contracts, incumbent HR exports, or company policies were supplied. Integration choices remain unconfigured.

## Canonical import envelope

Every import job records organization, source system, source file checksum, format/schema version, uploader, purpose, received time, intended effective date, row count, mapping version, validation result, reviewer, and commit reference. Every row retains source row number, external ID, canonical ID, normalized values, and safe error codes. Raw uploads remain restricted and expire under the approved retention policy.

Employee template requires employee code, legal/display names, verified organizational mapping, joining date, employment type, and work email if applicable. Compensation and bank details use separate restricted templates. Initial leave balances require policy year, leave type, available units, reserved units, cut-off date, and supporting reconciliation. Attendance requires source event ID, employee mapping, timestamp with offset/timezone, and direction.

## Migration procedure

1. Inventory source files and owners. Freeze a schema and approve a mapping workbook; do not assume similarly named columns mean the same thing.
2. Export using owner-approved tools. Encrypt transport/storage; never send personnel files through public conversion services.
3. Parse in quarantine, verify MIME/extension/size, scan attachments, and normalize whitespace, dates, currency, and identifiers. Reject formulas/macros in data imports.
4. Stage rows without changing live records. Validate required fields, uniqueness, manager cycles, reference mappings, effective-date overlaps, employment dates, and exact totals.
5. Display dry-run counts: create/update/unchanged/rejected plus restricted row-level errors. Never silently discard or coerce ambiguous date formats.
6. HR/Finance reviewers reconcile source row counts, employee counts by entity, active employment, compensation totals, leave opening balances, and historical payroll totals. Resolve duplicates explicitly; do not auto-merge people by name.
7. Apply approved batches with transaction checkpoints and deterministic source mapping keys. Re-running the same source version must produce no duplicate rows or financial postings.
8. Reconcile committed counts/checksums, preserve evidence, and enable ESS only after identity links are verified. Record cut-over time and the last accepted legacy source event.
9. Run an agreed correction window. Rollback a prelaunch migration by restoring the approved snapshot; after live transactions, use compensating corrections rather than destructive rewind.

Large imports may commit bounded batches, but the job stays incomplete until all required batches reconcile. Dependent features cannot treat an incomplete migration as authoritative. Failure report downloads require the same scope as the original import.

## Integration synchronization

Use unique `(source, external_id)` mapping and replayable cursors/checkpoints. Store source occurrence time separately from receipt time. Detect deleted/disabled accounts explicitly. Never let an older device event overwrite a newer policy or employment assignment. Vendor outages surface freshness and missing-source warnings; no fabricated attendance.

Webhooks require signature, timestamp/replay validation, durable receipt, deduplication, and quarantine for unmapped employees. Reconciliation jobs compare source counts against received events over overlapping windows to catch late deliveries. Rotate provider credentials via secrets management and document revocation.

## Quality gates

No unreviewed employee duplicates, unresolved manager cycles, orphan references, unexplained balance differences, or unidentified payroll source versions at go-live. Numeric reconciliation must be exact at the approved settlement precision; aggregate agreement cannot conceal per-employee errors. [Testing](testing.md) owns executable scenarios; [research](research.md) owns evidence about public sources.
