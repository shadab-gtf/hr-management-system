# Testing and acceptance strategy

Status: required test plan; application tests not implemented · Owner: QA Lead + domain owners · Updated: 2026-09-28

## Test layers

Unit tests verify pure policy/math/time functions with independent expected outputs. Integration tests use real PostgreSQL transactions, RLS, constraints, outbox, and lease behavior. Contract tests validate OpenAPI/runtime schemas and common domain behavior across API/actions. E2E tests exercise critical user outcomes against a production build with deterministic synthetic data. Manual acceptance covers payroll policy, assistive technology, device permissions, and recovery drills.

Tests must prove behavior, not mirror implementation branches or snapshot arbitrary markup. No blanket coverage percentage replaces payroll/security invariants. Mutation/property tests are appropriate for calculation and ledger invariants; simple reversible visual changes need targeted verification rather than unnecessary unit tests.

## Core acceptance matrix

| Test ID | Requirement | Scenario and expected result |
| --- | --- | --- |
| T-01 | HR-01 | Employee changes employee/document/run IDs in URLs/API: no unauthorized record/field appears |
| T-02 | HR-01 | Same ID/role across two synthetic organizations: RLS, services, exports, workers, and caches remain isolated |
| T-03 | HR-01 | Session revoked or role removed while screen open: next command/download denied |
| T-04 | HR-02 | Midmonth manager/location/compensation change: historical as-of queries preserve original assignment |
| T-05 | HR-02 | Duplicate import and cyclic manager hierarchy: rejected safely with row evidence |
| T-06 | HR-03 | Inspect HTML, React payload, JSON, logs: directory has no salary/bank/private contact fields |
| T-07 | HR-04 | Duplicate device event, delayed event, out-of-order punches: one raw event per source key, deterministic projection |
| T-08 | HR-04 | Overnight shift, missed out-punch, break/grace boundary, timezone conversion: approved policy result or visible exception |
| T-09 | HR-05 | Two leave requests race for the last unit: only one valid reservation commits |
| T-10 | HR-05 | Approve/reject/cancel replay, delegated self-approval attempt: one posting, authorized actor only |
| T-11 | HR-05 | Holiday, half-day overlap, year carry-forward/expiry: exact policy-defined units and balances |
| T-12 | HR-06 | Same frozen inputs/rules/engine repeated: identical employee lines and run digest |
| T-13 | HR-06 | Rounding edge, cap boundary, join/exit, midperiod change, LOP, arrears, negative net: Finance-signed expected results |
| T-14 | HR-06 | Operator tries own approval; result changes after review: deny self-approval and stale digest |
| T-15 | HR-06 | Published result edit or late attendance: immutable original, explicit adjustment only |
| T-16 | HR-06 | Payment export retry/lost acknowledgment/partial settlement: no duplicate intent, no false paid status |
| T-17 | HR-07 | Wrong MIME, malicious content, scan outage, expired grant: quarantine/deny without object exposure |
| T-18 | HR-07 | Effective offboarding and rehire: revoke old access, preserve prior employment, link new employment correctly |
| T-19 | HR-08 | Confidential helpdesk category and audience changes: only authorized recipients access content |
| T-20 | HR-09 | Migration/report/export: source-to-target counts and exact per-employee totals reconcile |
| T-21 | HR-09 | CSV cells beginning with executable prefixes and revoked export rights: safe output and denied download |
| T-22 | HR-10 | Same receipt/claim settlement retried: review duplicate and issue one reimbursement |
| T-23 | HR-11 | Draft review before release/manager transfer: no early feedback disclosure |
| T-24 | HR-12 | Candidate retention/hire conversion: verified identity link, separate restricted history |
| T-25 | HR-13 | Cache inspection after payroll, logout, second login, offline: no persisted private content |
| T-26 | HR-13 | Slow/failing independent section: matching skeleton, no blank screen, functioning remaining content |
| T-27 | HR-13 | Keyboard, screen reader, 200% zoom, small viewport, both themes: all primary tasks complete |
| T-28 | HR-14 | Native token theft/revocation, denied permission, deep link: safe recovery and shared API policy |
| T-29 | HR-15 | Prompt injection in uploaded policy, unauthorized retrieval request: no cross-scope data or autonomous command |
| T-30 | HR-16 | Worker crashes after commit/before acknowledgment: safe retry, no lost outbox or duplicate ledger |
| T-31 | HR-16 | Restore DB+objects+keys and reconcile post-restore payments/deletions: achieved RPO/RTO recorded |
| T-32 | HR-16 | Compatible rollback with active jobs: critical paths recover without duplicate external effects |

## Payroll qualification

Finance provides independently calculated fixtures for each active jurisdiction and rule version. Test exact decimals, rounding sequence, rule effective boundaries, compensation versions, tax-year transitions, YTD continuity, final settlements, and component dependency cycles. Cover unsupported inputs as blocking errors rather than silently coercing them.

Two consecutive shadow periods must reconcile every employee/component against the approved incumbent process. Attach a signed differences register and input/rule checksums. “Totals approximately match” does not pass. A changed rule requires impact preview plus relevant regression suite before activation.

## Performance and concurrency

Seed 5,000 synthetic employees, multiple legal entities/locations, realistic attendance history, and pending approvals; do not copy real production HR data. Exercise 500 concurrent sessions and 100 attendance events/second for 10 minutes while a payroll job runs. Verify read/write latencies, queue lag, DB locks/connections, memory, and recovery after worker interruption. These are planning fixtures, not GTF headcount claims.

Use [size management](size-management.md) for route weights, five-run Lighthouse medians, and browser/device profile recording. Measure cold loads, navigation, delayed images/fonts, validation errors, and skeleton replacement. Test the full employee journey; a fast empty dashboard is not representative evidence.

## Accessibility and visual QA

Automated checks run on all critical states, but manual keyboard and screen-reader tasks are required. Test focus return/trapping, names/descriptions, live announcements, error summaries, sortable tables, color contrast, non-color status cues, reduced motion, OS high contrast, touch targets, zoom, and both themes. Use synthetic fixture screenshots with long names, large amounts, empty lists, and multiline errors.

## Security and resilience

Add CSRF, session fixation, enumeration, input injection, unsafe rich text, upload decompression, SSRF, signed webhook replay, throttling, and cache-poisoning cases. Test policy changes during a long-running export and recheck scope on download. Use fault injection for provider outage, DB deadlocks, connection saturation, clock drift, queue lease expiry, and disk/object failures. No paid production bank action is executed by tests.

## Test data and evidence

Fixtures use synthetic names and dummy identifiers that cannot be mistaken for live accounts. Freeze clocks only in test contexts and cover leap day/month boundaries; timezone tests include DST transitions for future international support even though the initial default is Asia/Kolkata. Seeds are versioned and deterministic.

Every release stores commit, artifact digest, environment/runtime, fixture version, executed test IDs, pass/fail results, performance reports, reviewer, and unresolved defects. No application test pass is claimed in this documentation-only release. Flaky tests get an owner and root-cause task; do not hide a critical failing control behind indefinite quarantine.
