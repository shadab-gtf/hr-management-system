# FE4 — greytHR-parity modules (mock backend)

Updated: 2026-09-30. Status: implemented against the synthetic mock backend, and local verification passed. Everything here is **frontend behaviour on mock data**: it resets on restart and on each new business day, and nothing is filed, emailed, paid or legally issued. Statutory rules are illustrative implementations for UI purposes and have not been reviewed by Finance or a tax adviser (payroll-rules.md).

## Scope delivered

| Module | Routes | Highlights | Who |
| --- | --- | --- | --- |
| Statutory payroll | `/payroll/statutory`, `/payroll/statutory/employees`, `/payroll/statutory/setup`, `/payroll/structures`, `/salary/form-16`, run page additions | Legal entities and registrations (multi-company), state mapping.<br>EPF with ceiling, EPS/EDLI/admin charges, VPF; ESI with contribution periods; data-driven PT and LWF slabs; TDS under the new and old regimes.<br>ECR v2, ESI, PT, LWF and 24Q files; challan register with due dates.<br>Salary structure templates (maker/checker) and CTC calculator; one-time payroll inputs and salary holds; NEFT bank advice.<br>Form 16 Part A/B, printable. | payroll, finance, employee |
| Leave & attendance | `/leave/comp-off`, `/attendance/roster`, leave-policy and attendance-rules additions | Per-type accrual, carry forward, encashment limits, sandwich rule, notice, maximum consecutive days, negative allowance, applicability, certificates.<br>Ledger-based balances and audited HR adjustments.<br>Comp-off validated against punches, with expiry; encashment paid through payroll; year-end preview and commit.<br>Shift roster planner (draft → publish, rotation patterns, weekly-off rules, shift swaps) that drives the attendance engine; late/early deductions and a monthly summary. | employee, manager, hr |
| Exit & assets | `/me/resignation`, `/me/assets`, `/admin/offboarding`, `/admin/settlements/**`, `/admin/assets`, `/admin/letters`, `/admin/policies`, `/documents/letters/[id]` | Resignation (notice policy, early release, withdraw; manager → HR); department clearances; confidential exit interview.<br>F&F settlement: final salary, EL encashment, gratuity, notice recovery or waiver, loans, asset recovery, TDS, maker ≠ checker, UTR, printable statement.<br>Asset inventory, assignment and requests.<br>Letter templates with placeholders and live preview.<br>Policy acknowledgements with completion tracking. | employee, hr, finance |
| Performance | `/performance`, `/performance/feedback`, `/performance/team`, `/admin/performance` | Review cycles and guarded phases; goals weighted to 100% with approval and check-ins; competencies; self and manager review; calibration against a guideline distribution; release-gated visibility; continuous feedback and 1:1 notes. The increment is a recommendation only. | employee, manager, hr |
| Recruitment | `/recruitment/**`, `/careers`, `/careers/[jobId]` | Requisition approval; jobs and a mobile pipeline board; candidates with duplicate detection, consent, retention and erasure.<br>Interviews with panel clash checks and blind scorecards; offers with over-budget approval and a printable offer letter; conversion to employee.<br>Public careers page and referrals. | hr, managers, finance |
| Engage & timesheets | `/engage/polls`, `/engage/praise`, `/admin/surveys/**`, `/timesheets`, `/timesheets/team`, `/timesheets/projects` | Polls; surveys (rating, eNPS, choice, text) with an anonymity threshold of 5 and CSV export; praise wall and leaderboard.<br>Projects with budget burn; weekly timesheet grid with validation; manager approval and reminders; approved-hours CSV. | everyone, managers, hr |
| Reports, notifications, language | `/admin/reports`, `/admin/reports/builder`, `/settings`, shell | Analytics with CSS charts and table fallbacks; standard report library with CSV/Excel export.<br>Custom report builder (datasets, columns, filters, group-by, saved, shared, scheduled) with salary scoping, PII masking and an export audit log.<br>SMS/WhatsApp channels behind mock OTP verification.<br>Hindi for the shell, navigation, dashboard, settings and notifications (Noto Sans Devanagari; `<html lang>` follows `gtf-lang`). | hr, payroll, finance, everyone |
| Cross-module | `/approvals`, top bar | "Also waiting for you" queue (comp-off, swaps, encashment, timesheets, resignations, F&F, asset requests, goal sheets, requisitions, offers, scorecards), counted in the Approvals badge; one-tap light/dark toggle in the header. | per capability |

New capabilities (types/session.ts, lib/mocks/handlers/shared.ts): `statutory.manage`, `timesheet.submit.self`, `timesheet.approve`, `project.manage`, `roster.manage`, `exit.request.self`, `settlement.prepare`, `settlement.approve`, `asset.read.self`, `asset.manage`, `performance.self`, `performance.review`, `performance.manage`, `recruitment.manage`, `candidate.interview`, `survey.manage`, `report.build`.

## Verification executed (2026-09-30)

- `pnpm typecheck` and `pnpm lint` (`--max-warnings=0`): clean.
- Production build (`NEXT_DIST_DIR=.next-verify next build`, run beside the developer's `next dev`): succeeded, all routes compiled.
- Playwright on a fresh production server (port 3100): 110 passed and 1 skipped (the pulse-survey response is already recorded for the day). The only failure in that run, an IT declaration check hit during streaming, was hardened and passed on rerun. New specs: `statutory`, `time`, `lifecycle`, `performance`, `recruitment`, `engage-plus`, `timesheets`, `reports`.
- Defects fixed during verification:
  - An offboarding list item outside a list, and low-contrast chip counts (both axe).
  - An `aria-label` on a non-role span in the poll avatar stack.
  - Strict-mode and required-label selectors in new specs, a missing member selection in the project test, and a wait before the manager-review form.

## Known gaps (frontend)

- Several specs mutate shared mock state, so run them against a freshly started server.
- Hindi covers the shell, dashboard, settings and notifications only; module pages and data content stay English.
- There is no real PDF, e-signature, email, SMS, WhatsApp, push or filing, and report schedules only log a delivery via "Run now".
- Synthetic data:
  - no seeded employee falls under the ESI ceiling;
  - gender is synthetic and used for maternity/paternity applicability;
  - the previous-FY Form 16 assumes the new regime.
- Comp-off, swaps, timesheets, exits and recruitment are decided on their own pages; the inbox links to them rather than deciding inline.
- Every new service needs live REST endpoints, and uploads still return 501 in live mode.
- 360px layouts are covered by the existing axe/overflow sweeps for earlier routes; the new module routes have not all been swept on real devices.
