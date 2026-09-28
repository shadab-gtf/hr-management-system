# Payroll rules and reconciliation

Status: calculation specification; statutory parameters unconfigured · Owner: Finance + Payroll Lead · Updated: 2026-09-28

## Governing rule

No example salary, tax rate, statutory threshold, or leave deduction from the attached overview is a GTF policy. The engine must support approved, effective-dated rules and explain every output. This document defines mechanics, not certified tax advice or GTF's final payroll policy.

## Required configuration

Per legal entity/pay group: pay frequency, currency, calendar, cut-off/payment dates, eligible employment categories, proration basis, rounding sequence, salary component definitions, taxable/contribution treatment, approved overtime/LOP rules, statutory registration/applicability, reimbursement treatment, loan/recovery authorization, and final-settlement policy.

Each statutory rule records official source/publication, effective period, jurisdiction, applicable population, wage base, thresholds/caps, employee/employer allocation, rounding, reviewer, approver, fixtures, and supersession reference. Unsupported jurisdiction or effective date blocks calculation rather than silently falling back to a generic rule. Finance must review current central/state obligations, including relevant EPF/ESI/PT/LWF/TDS requirements, through official sources listed in [research](research.md). No rates are hard-coded here.

## Calculation pipeline

1. Resolve employment/pay-group membership and effective assignment over the period, splitting at joining, exit, transfer, and compensation/rule change boundaries.
2. Freeze approved attendance, leave, LOP, overtime, recurring compensation, one-off adjustments, benefits, tax declarations, prior-period/YTD balances, and verified bank versions.
3. Validate unresolved exceptions, missing configuration, overlaps, duplicate employment inputs, negative/unsupported amounts, and rule coverage. Block unresolved material errors.
4. Evaluate a safe, typed component dependency graph. Reject circular references and arbitrary code. Calculate exact intermediate decimals; record quantities, rate bases, rule versions, and inputs.
5. Apply the approved proration method. Calendar-day, working-day, and fixed-divisor policies are explicit alternatives; do not select one implicitly.
6. Apply earnings, employee deductions, employer contributions, and approved tax treatment in the rule-defined dependency order. Employer costs do not reduce employee net unless separately defined as legitimate employee deductions.
7. Apply component and final settlement rounding exactly as approved. Persist rounding adjustment lines when necessary so displayed totals reconcile.
8. Compare previous-period/YTD and expected totals. Flag large changes, joiners/leavers, arrears, changed bank accounts, negative net, duplicate results, and missing employees.
9. Submit the immutable run digest to independent review. Generate/publish artifacts only after approval and successful complete rendering.
10. Produce approved payment instructions, then reconcile external acknowledgments separately. Payroll approval/publication is not evidence of bank settlement.

## Run state machine

`draft → validating → calculating → ready_for_review → in_review → approved → publishing → published → closed`.

Validation/calculation errors move to `failed` with diagnostics. A failed preapproval run can be superseded by a new revision after correction; preserve the old attempt. A reviewer may `reject` an in-review run; resubmission requires a new reviewed revision/digest. Approval freezes amounts/inputs; publication retry reuses approved results and artifact identities. No return from approved/published to editable draft.

Only an operator can prepare/submit; only a different eligible approver can approve. A separately authorized publisher may publish. Period closure requires reconciled payment/accounting status or a documented authorized outstanding-item exception. All transitions require expected version, permission, reason where relevant, and audit. Disbursement state is separate: `not_exported → exported → submitted_externally → partially_reconciled | paid | failed`.

## Attendance and leave interface

Missing or irregular punches remain exceptions until approved policy resolution. Attendance does not directly issue financial deductions. HR approves payable days, LOP units, and overtime inputs before freezing. Leave cancellation or late attendance after cut-off creates a next-period/off-cycle adjustment request. It does not silently recalculate already approved payslips.

Accrual, carry-forward, expiry, encashment, and final-settlement leave treatment are separate policy operations. A leave ledger posting cannot itself invent an encashment rate. Negative leave balances require an explicit approved policy and visible exception.

## Exact arithmetic fixture

Synthetic arithmetic-only fixture, unrelated to any actual employee or statutory rate: base earning `50000.00`, allowance `10000.00`, approved employee deductions `3500.00`, employer contribution `2000.00`. Expected gross `60000.00`, net `56500.00`, employer cost `62000.00`. Employer contribution must not reduce net to `54500.00`. Run with component-rounding boundary cases such as `.005` under the explicitly chosen rounding mode; no unspecified default.

Production fixtures must add actual approved rule rates/bases, tax regime/year applicability, caps, joiners/leavers, midmonth changes, prior-employer declarations where applicable, arrears, variable pay, negative-net handling, final settlement, and each supported jurisdiction. Finance signs expected results independently of the implementation.

## Reconciliation gates

Reconcile employee count, gross, each component, each employee deduction, employer contributions, net, YTD, opening/closing loan balances where used, accounting export totals, and payment-file totals. Compare per employee first, then aggregate. Two employees' opposite errors must not cancel out unnoticed.

Two consecutive shadow cycles against the incumbent payroll process are required. Every difference is either corrected or explained by an approved policy/input difference with evidence; there is no generic unexplained tolerance. Retain run inputs, engine version, rule versions, evidence, reviewer, and digest. Re-running the same frozen snapshot with the same engine/rules must produce identical results.

## Payment and final settlement

Initial bank integration is a verified format export with maker/checker control; no automated transfer. Encrypt restricted exports, limit downloads, log access, and recheck permissions. Duplicate export generation refers to the same settlement intent and cannot create a second liability. Failed payment retries reference the original item and prove nonsettlement before reissue.

Final settlement uses employment end date, approved payable days, leave encashment/recovery rules, asset/loan balances, authorized recoveries, and statutory review. Asset nonreturn does not automatically authorize salary withholding. Exit revocation and employee access to required records are separate from settlement state; HR/Finance define the secure delivery method.

## Acceptance and ownership

Finance owns correctness and effective-date applicability; Engineering owns deterministic execution and auditability. Security owns sensitive access; Operations owns backup/recovery. Formula changes require review, impact preview, regression fixtures, signed activation, and rollback via new rule version. Source freshness is checked before every production payroll close.
