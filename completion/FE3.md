# FE3 — HR administration, imports and monthly reports

Updated: 2026-09-29. Status: implemented against the synthetic mock backend; local verification passed. Everything here is **frontend behaviour on mock data**. Server enforcement, persistence, audit and imports on the live service remain backend work.

## Scope delivered

| Area | Delivered | Who |
| --- | --- | --- |
| Holidays | Year view; add, edit and remove; type (national, festival, optional); all locations or selected ones. Clash checks run per overlapping location. Past holidays are locked. Leave charging, attendance and the employee holiday calendar use the list for each employee's location. | HR (`policy.publish`) |
| Events & celebrations | Create, edit and cancel events with date, time, venue, category and audience (everyone or a department). Events can be posted to Engage. A Home "Upcoming events" card shows each employee their audience's events. Work anniversaries and new joiners can be switched on or off; birthdays stay off because birth dates are private. | HR (`event.manage`) |
| Leave policy | Leave types: code, days per year (or unlimited), carry-forward, half days, "counts as working day" (a seeded Work-from-home type) and active flag. Every save creates a new policy version, which approvals display. Each type keeps its own balance, and inactive types can't be requested. | HR |
| Attendance rules | Multiple shifts with presets (9–5, 9–6, 9:30–6:30, 9:30–7, 10–7), a live working-time preview, grace and break. Includes a default shift, per-department assignment (saved on change) and office sites for the geofence (lat/long/radius). | HR |
| Overtime | Policy covers the buffer after shift end, the block size, a daily cap, comp-off vs paid, and manager approval. Overtime is worked out from check-out time, shown in the attendance calendar (+OT) and summed in the monthly summary. | HR sets it; employees see it |
| Organization | Departments (renames carry their employees with them), cost centers and department heads. Locations can be added, and removed only when empty. Probation defaults per employment type run 0–6 months. | HR |
| Employee lifecycle | People: Add employee (duplicate-name guard, joining date no more than 30 days back, probation override; salary is left for Payroll). Profile: Edit job details (effective-dated, version check, manager-cycle guard, recorded on the timeline) and Start exit (blocked while the person has direct reports). Probation status is shown on the profile. | HR (`employee.create` / `employee.update`) |
| Onboarding / offboarding | Onboarding and exit checklist templates can be edited: task, owner, due offset and blocking flag. The offboarding board has task toggles and a "Complete exit" step gated on blocking tasks being done and the last working day being reached. | HR (`onboarding.manage`) |
| Service requests | One queue for profile changes (HR; bank changes go to Finance only), letters (HR: start drafting, issue into the employee's documents, or reject with a reason) and loans (Finance). Nobody sees their own requests. The request hub shows the outcome. | HR / Finance |
| Announcements | Edit, schedule for later (India time) and target everyone or a department. Scheduled items stay hidden from employees until they're due. | HR |
| Face-device attendance import | Drag-and-drop CSV or .xlsx. The layout is detected automatically: daily (code, date, in, out) or punch log (code, date-time, IN/OUT, collapsed to first in / last out). Column-name synonyms, DMY/ISO/Excel-serial dates, and 12- or 24-hour and Excel-fraction times are handled. The dry run flags unknown codes, future or pre-joining dates, out-before-in and in-file duplicates. It notes rows that were already imported, missing check-outs, holiday work and approved leave or WFH. Nothing changes until HR commits, and a commit happens only once, so re-uploading the same file is safe. Committed punches drive attendance, late marks and overtime. A CSV template is provided. | HR (`import.commit`) |
| Salary import (maker/checker) | Drag-and-drop CSV or .xlsx. Amounts are read as exact paise ("19,80,000", "₹…", "12 L", "12 LPA"); components are annual, or monthly if the column header says so. Validation covers active codes, an effective window of 12 months back to 6 months ahead, components not exceeding CTC, and flags for basic under 50%, changes over 30% and decreases. Unchanged rows are skipped and a conflicting submitted batch blocks the row. The operator submits and an **independent** approver (`payroll.approve`) approves or rejects with a reason. Approval applies effective-dated revisions: payroll includes the person once compensation exists, the employee's Salary revision page updates, and future dates apply on their effective date. HR is denied access. PDF and Word files are refused with guidance. | Payroll operator / Finance |
| Monthly reports | Payroll register CSV per run: every earning, deduction and employer component, gross, net, and a totals row. It is formula-safe and permission-checked on each download (payroll roles only), available from the run page and the run history. Monthly attendance CSV per employee: present, late, half day, leave, needs review, holidays, weekly off, worked hours and overtime hours (`report.read`). | Payroll / HR |
| Live location evidence at check-in | Each punch that shares location shows five fields: detected location (coordinates, links to OpenStreetMap), distance from the geofence centre with its radius, a reverse-geocoded address, GPS accuracy with a grade, and verification (verified, outside, accuracy too low, not shared, or no geofence). The address and nearest landmark within 400 m come live from OpenStreetMap's free APIs (Nominatim and Overpass). These calls are server-side, need no key, are throttled to 1 request per second and cached for 12 hours. Endpoints are configurable through `GTF_NOMINATIM_URL` and `GTF_OVERPASS_URL` for a self-hosted instance, and `GTF_GEOCODER=off` disables lookups. No coordinates are hardcoded: office sites start empty, and HR adds each one by live address search or "Use my current location". The employee is told their position is sent to OpenStreetMap. | Everyone; HR adds sites |
| Notification preferences | Settings: email and push per topic (in-app is always on) plus quiet hours, saved on the server. Delivery is labelled as not yet connected. | Everyone |
| Install prompt | A small card instead of a full sheet: bottom-right on desktop, top on phones. | Everyone |

New capabilities (mock seed): `policy.publish`, `event.manage`, `letter.issue` and `import.commit` for HR; `loan.approve` for the Finance approver; `compensation.manage` for the Payroll operator. The navigation group "HR admin" now holds 11 pages. "Payroll" now holds Payroll runs and Salary import.

New dependency: `read-excel-file@9.3.10` (MIT), used server-side only to read .xlsx. CSV parsing is built in (RFC 4180, auto-detects `,` `;` or tab).

## Verification executed

- `pnpm typecheck` and `pnpm lint` (0 warnings): pass. `pnpm build`: pass, 55 routes.
- Playwright against the production build (Chromium), fresh server: **60/60 passed**. That is 43 existing tests (one Settings assertion re-scoped because Settings gained a Notifications card) plus 17 new ones in `admin.spec.ts`, `attendance-import.spec.ts` and `payroll-import.spec.ts`. They cover:
  - holiday add and clash validation with values retained; the employee sees the holiday;
  - leave-policy version bump, and WFH offered to employees;
  - adding an employee with 3-month probation, which then appears in onboarding;
  - job change on the timeline; exit started and blocked from closing early;
  - HR verifying an address change while bank changes go to Finance only; reject needs a reason;
  - an event on Home, and a scheduled department announcement hidden from employees;
  - a preset shift assigned to a department, which the employee then sees;
  - notification preferences persisting;
  - employees denied access to admin pages;
  - axe clean on 8 admin routes at 1280 px dark and 360 px light, with no horizontal overflow;
  - CSV import dry run, commit, re-upload skipped, and the employee's calendar showing the punches;
  - Excel punch-log fixture (`tests/fixtures/face-device-punch-log.xlsx`) with Excel serial date-times;
  - bad file type and missing-header errors;
  - salary sheet: dry run, submit, the preparer blocked from approving, HR denied, Finance approves, and the employee's revision page updated; PDF refused;
  - payroll register and attendance CSV downloads with 403s for the wrong roles.
- Lighthouse (mobile, simulated) on the production `/login`: performance 99, accessibility 100, best practices 100 (`evidence/lighthouse-mobile.json`). Signed-in routes were not profiled, because Lighthouse can't log in.
- Defects found and fixed during verification: a stale test server skewed the first full run; a leftover port-3100 process; a punch-log date-time held as an Excel number lost its time; and test isolation between the import test and the seeded missing-check-out day.

## Mock vs real behaviour

| Mocked here | Real system must provide |
| --- | --- |
| Config edits change in-memory state immediately | Versioned policy records with effective dates, independent approval where required, and audit |
| Device import parses in the web server and overrides synthetic days | Upload to the import service: virus scan, immutable raw punch events, source/device IDs, reconciliation, and an optional direct device API |
| Address and landmark lookups call public OpenStreetMap servers (free, rate-limited) | Self-hosted Nominatim and Overpass for volume or data-residency, via the same env vars |
| Salary import stores paise in memory; one approval applies it | Compensation ledger, step-up authentication for the approver, arrears calculation, and payroll input snapshots |
| Letters "issue" a metadata-only document record | Template rendering, digital signature and stored PDF |
| CSV exports are built on request | Report jobs with expiring downloads (`api-contract.md`) |
| Notification preferences saved; nothing delivered | Mail relay, VAPID web push and quiet-hours scheduling |

## Remaining (frontend)

- [ ] Boneyard capture of the signed-in routes. The Boneyard CLI can't authenticate, so these routes keep layout-matched CSS skeletons. The foundation bones were regenerated on 2026-09-29.
- [ ] Real-device checks (iOS/Android install, camera, geolocation over HTTPS), Firefox/WebKit, and screen-reader passes.
- [ ] Wire the live endpoints listed in each service. Uploads need multipart support in the transport; they return 501 in live mode today rather than pretending to work.
- [ ] Items carried over from FE1/FE2: Iconsax artwork provenance, SBOM, and the ESLint major upgrade.
