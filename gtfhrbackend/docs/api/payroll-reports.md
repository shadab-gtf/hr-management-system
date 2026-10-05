# Payroll, compensation, statutory and reporting APIs

All paths below are under `/api/v1`, use the shared JSON envelope and require the authenticated employee's current capabilities. The frontend adapters call these APIs in live mode. Source contracts are owned by this backend in `src/contracts`; integration tests additionally validate responses against the frontend Zod schemas.

## Payroll and employee salary

| Method     | Path                                       | Behavior                                                            |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------- |
| GET        | `/payroll/overview`                        | Runs, exceptions and current payroll totals                         |
| POST       | `/payroll/runs`                            | Create a unique payroll month                                       |
| GET        | `/payroll/runs/:id`                        | Register, inputs, holds, variance, audit and available commands     |
| POST       | `/payroll/runs/:id/calculate`              | Calculate and persist every employee result plus calculation inputs |
| POST       | `/payroll/runs/:id/submit-review`          | Submit calculated payroll                                           |
| POST       | `/payroll/runs/:id/approve`, `/reject`     | Independent Finance decision                                        |
| POST       | `/payroll/runs/:id/publish`                | Release immutable payslips and notify employees                     |
| POST       | `/payroll/runs/:id/mark-paid`              | Record payment and settle eligible loan installments atomically     |
| POST       | `/payroll/runs/:id/inputs`                 | Add bonus, incentive, arrears, deduction or half-day LOP override   |
| POST       | `/payroll/runs/:id/inputs/:inputId/remove` | Remove an editable payroll input                                    |
| POST       | `/payroll/runs/:id/holds`                  | Hold an employee's payment                                          |
| POST       | `/payroll/runs/:id/holds/:holdId/release`  | Release an existing hold with a reason                              |
| GET        | `/payroll/runs/:id/register/export`        | Audited payroll register CSV                                        |
| GET        | `/payroll/runs/:id/bank-advice/export`     | Audited bank advice for verified, payable accounts                  |
| GET        | `/me/payslips`, `/me/payslips/:id`         | Only the employee's published or paid salary snapshots              |
| GET        | `/me/compensation`, `/me/salary/ytd`       | Effective compensation history and published year-to-date salary    |
| GET, PATCH | `/me/tax/declaration`                      | Configured declaration windows, sections and amounts                |
| GET        | `/me/tax/statement`                        | Actual TDS and configured projection                                |
| GET, POST  | `/me/loans`                                | Own loans and a new request                                         |
| POST       | `/loans/:id/decisions`                     | Independent approval or rejection                                   |

Mutations accept `Idempotency-Key` where applicable; versioned changes also accept `If-Match`. A preparer, calculator or input editor cannot approve their own run. Inputs stop changing when the run is submitted; database triggers prohibit editing approved, published or paid result snapshots. Every payroll calculation stores its configuration, templates, effective compensation, declarations, inputs, employment dates, loan balances and source leave amounts. Arithmetic uses integer paise and BigInt multiplication/division, including prorated salary and installment recovery. Employment and mid-month compensation dates are applied. Active employees without effective compensation block calculation. Approved unpaid leave and encashment records feed payroll; approved final settlements exclude subsequent duplicate payroll. An attendance discrepancy is not automatically treated as unpaid leave: Payroll must resolve it through approved leave or an explicit LOP input.

Marking an entire run paid requires every payment hold to be released and every positive-net employee's current bank account to be verified. Bank profiles are locked while recording payment to serialize concurrent bank changes. Register eligibility and exports use current bank verification; published monetary snapshots stay fixed. Approved leave's stored charge dates preserve the correct unpaid days across month boundaries, including half days and weekends.

## Structures and compensation imports

| Method | Path                                                 | Behavior                                                                     |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/payroll/structures`                                | Current templates, assignments, proposed changes and optional CTC calculator |
| POST   | `/payroll/structures/:id/changes`                    | Propose template terms                                                       |
| POST   | `/payroll/structures/assignments/changes`            | Propose group assignment                                                     |
| POST   | `/payroll/structures/changes/:id/:decision`          | `approve`, `reject`, or preparer's `withdraw`                                |
| GET    | `/compensation/imports`, `/compensation/imports/:id` | Persisted batch history and row validation                                   |
| POST   | `/compensation/imports/upload`                       | Actual CSV/XLSX file as `{fileName, base64}`; maximum 5 MiB and 5,000 rows   |
| POST   | `/compensation/imports`                              | Validated structured rows                                                    |
| POST   | `/compensation/imports/:id/decisions`                | Submit, independently approve or reject the persisted preview                |
| POST   | `/compensation/imports/:id/discard`                  | Discard an eligible batch                                                    |

An approved batch creates effective compensation records in the same audited transaction. Invalid employees, duplicate/effective dates, invalid currency values and stale compensation are rejected. File parsing happens on the backend; live mode never falls back to browser fixture data.

## Statutory records

The `/payroll/statutory` hub aggregates stored run results. `/setup` and `/employees` expose statutory setup and masked employee records. `PATCH /settings`, `PATCH /pt/:state`, and `PATCH /employees/:id` apply validated, versioned changes. `POST /employees/:id/bank-verification` requires payment capability and a different verifier from the person who changed the bank account. Full account numbers and employee PAN are encrypted at rest with `ENCRYPTION_KEY`.

`POST /payroll/statutory/challans` records a real payment reference against a finalized payroll obligation; duplicate obligations and future payment dates are rejected. `GET /payroll/statutory/files/:file?month=YYYY-MM` supports `ecr.txt`, `esi.csv`, `pt.csv`, `lwf.csv` and `24q.csv`, with optional legal entity. These are working CSV statements for reconciliation; they are not a certified electronic filing adapter for EPFO, ESIC or tax portals.

`GET /me/tax/form-16`, `GET /payroll/form-16`, `GET /payroll/form-16/:employeeId`, and `POST /payroll/form-16/:fy/generate` expose employee previews, readiness and persisted annual salary/TDS certificates. Missing PAN, an open year and incomplete TDS deposits block generation. A short entity/month challan is allocated proportionally in integer paise and never treated as fully deposited. These generated application records do not replace a downloaded, digitally signed government-issued Form 16 Part A; portal receipt numbers remain absent until a filing integration is supplied. Previously issued records remain immutable.

## Reports

`GET /reports/library`, `/builder`, `/workforce`, `/analytics/workforce` and `/preview` use actual employees, compensation, attendance classification, leave records and payroll snapshots. There are eleven standard exports at `POST /reports/standard/:key/export`: `headcount`, `joiners_leavers`, `attrition`, `probation_due`, `celebrations`, `attendance_summary`, `late_coming`, `leave_balances`, `leave_availed`, `salary_register`, and `ctc_by_department`.

`POST /reports/custom/export` exports a validated custom specification. Saved reports support GET/POST `/reports/saved`, GET/PATCH `/reports/saved/:id`, POST `/reports/saved/:id/delete`, and POST `/reports/saved/:id/export`. Export formats are escaped UTF-8 CSV and Excel-compatible SpreadsheetML (`xls`). Formula-leading text is escaped. Salary columns, payroll datasets and salary aggregations require payroll capability even when a report is shared. Editing and scheduling require ownership; revoked roles are checked again for delivery downloads.

Schedules use PATCH `/reports/saved/:id/schedule`, POST `/schedule/delete`, and POST `/schedule/run`. `createReportsService(prisma).processDue()` is the worker entry point. It locks each scheduled report, rechecks its due date, persists an immutable artifact, queues inbox notifications and durable mail, and advances the next run. A failed job is audited, paused and reported to its owner without stopping other jobs. The server worker invokes it; SMTP delivery is handled by the shared mail outbox dispatcher. No report service sends external mail directly.

GET `/reports/exports` and POST `/reports/exports` provide audited download history. GET `/reports/deliveries` and `/reports/deliveries/:id/download` provide authorized delivery artifacts. The frontend's existing authenticated download proxy uses `/api/reports/saved/:reportId?delivery=:deliveryId`.

The employee onboarding UI does not currently collect date of birth or gender. Reports leave dates unavailable and describe gender as uncollected. Birthday lists are therefore empty until those source fields are collected. Anniversaries and joiners derive from real employment dates; no fake birth dates or genders are generated. Voluntary exit reasons are not currently collected by this report source. Probation reports use the configured duration and employee joining date.

## Production provisioning

Development payroll seeding uses a clearly labeled synthetic policy and sets `approvedForProduction=false`. The production calculator rejects that policy. Do not load the demo seed into a production database.

An authorized deployment operator can apply an independently reviewed Finance provisioning file with:

```sh
pnpm exec tsx scripts/payroll-provision.ts /secure/path/payroll-reviewed.json
```

The strict top-level input has `preparedBy`, `approvedBy` (different existing Payroll and Finance employee IDs), a review `reason`, `expectedSettingsVersion` (`0` for initial setup), optional `policy`, `templates`, `profiles`, and `openingCompensation`. The command verifies current roles and settings version, applies all changes in one transaction, and audits a digest plus counts without recording sensitive values. It is an offline deployment command, so access to the reviewed file and database credentials must follow the organization's administrative access process. It is not a substitute for interactive authentication of two separate people.

The complete policy shape is `policySchema` in `src/modules/payroll/payroll.schema.ts`. Finance must supply applicable financial years, tax slabs/rebates/standard deductions, HRA parameters, contribution rates in basis points, declaration windows/limits, legal entities, registered states, location mappings, PT/LWF rules, due dates and salary template assignments. Set `approvedForProduction=true` only after verifying these against the organization's applicable rules. Policy rates are configuration, not a claim that the demo thresholds reflect current law. Every year listed in a policy uses the supplied rate set; deploy the reviewed policy before that year's calculation. The current engine does not implement all tax special cases, including surcharge/marginal relief and ESI contribution-period continuation after a salary increase; organizations requiring those cases must extend and verify the policy engine before issuing payroll.

Template entries contain `{id, terms}` using `templateTermsSchema`. Profile entries require `employeeId`, `entityId`, `state`, and may include `pan`, `uan`, `pfMemberId`, `esiIp`, `bankName`, `accountNumber`, `ifsc`. Supplied PAN/account values are encrypted; any bank change resets verification to pending. Opening compensation entries contain `employeeId`, `effectiveFrom` (ISO date), `annualCtc` (exact decimal rupees), and `reference`. Existing compensation history cannot be replaced by this command; subsequent revisions must follow the approval workflow. Remove the provisioning file from the deployment workspace after applying it according to your secure document retention policy.

New employee creation calls `ensureProfile` using configured entity/location mappings. An approved profile bank-account change calls `upsertBankAccount` in the same transaction and requires subsequent independent verification. Configure opening compensation and any missing statutory/bank fields before the employee's first payroll. Configure a stable production `ENCRYPTION_KEY` and retain it for encrypted historical records, plus the shared authentication, database, worker and SMTP settings documented in the main backend deployment guide.

## Verification

`tests/integration/payroll/payroll.test.ts` covers frontend DTO compatibility, own-row access, approval separation, idempotency, optimistic locking, encrypted profile workflows, actual upload/approval, immutable publication, holds and exports, saved/scheduled report access, short TDS/PAN certificate blocking and all eleven standard exports. `tests/unit/payroll/money.test.ts` checks integer money/EMI arithmetic. Execute these only through the project's disposable PostgreSQL sandbox runner.
