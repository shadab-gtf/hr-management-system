# UI specification

Status: screen and interaction contract · Owner: Design + Frontend Lead · Updated: 2026-09-28

## Application shell

Use the required Iconsax family through the adapter in [reusable components](reusable-components.md), after exact artifact/provenance verification. [User flows](user-flow.md) details journeys; [roles and permissions](roles-permissions.md) defines capabilities; [state management](state-management.md) defines local versus server state. No paid component template or additional icon pack is required.

Desktop: 256px navigation rail, 64px top bar, breadcrumb/page heading, and a content canvas capped at 1440px except authorized wide reports. Top bar contains organization context, accessible search entry if implemented, notification count, and account menu. Do not display payroll totals or private notification text in global chrome.

Navigation groups: Home; People; Time & Leave; Pay; Requests; Reports; Administration. Visible items are a usability projection of server permissions. Every destination still checks permissions. Managers get a team scope switch where authorized; switching scope does not alter identity. Mobile uses a top bar and four essential bottom destinations: Home, Time, Requests, More. Payroll-admin workflows remain fully accessible on web with clear small-screen constraints.

## Route map

| Route | Audience / content | Main action |
| --- | --- | --- |
| `/login` | Enterprise sign-in, recovery route, service notice | Sign in |
| `/dashboard` | Role-specific tasks, attendance, leave, announcements | Highest-priority permitted task |
| `/me/profile` | Own permitted profile fields and change-request history | Request change |
| `/employees` | Directory or HR employee table | Add employee if permitted |
| `/employees/[employeeId]` | Overview, employment, documents, lifecycle; restricted payroll tab | Authorized edit/request |
| `/attendance` | Own day/month view or team exception table | Mark attendance / regularize |
| `/shifts` | Assignment calendar, roster exceptions | Publish approved roster |
| `/leave` | Available/reserved balances, calendar, request history | Request leave |
| `/approvals` | Assigned decisions with policy and impact context | Review selected request |
| `/payroll` | Periods, readiness, run state | Prepare run |
| `/payroll/runs/[runId]` | Validation, variance, component totals, audit | Submit / approve / publish by state |
| `/me/payslips` | Published own payslips by period | Secure download |
| `/documents` | Authorized categories and scan states | Upload document |
| `/onboarding` and `/offboarding` | Task board with owners and blockers | Complete permitted task |
| `/helpdesk` | Own requests or assigned confidential queue | Raise request |
| `/expenses` | Claims, receipts, approval and settlement states | Create claim |
| `/performance` | Goals/cycles and released reviews | Complete assigned step |
| `/recruitment` | Scoped candidate pipeline | Create/open application |
| `/reports` | Authorized report catalog, jobs, downloads | Generate report |
| `/settings` | Policy versions, organization, permissions, integrations | Draft configuration change |
| `/audit` | Scoped read-only audit search | Export with permission |

Every data-bearing route and nested detail route has route-specific `loading.tsx`, `error.tsx`, metadata, and a not-found/access-denied treatment. Future-phase routes remain absent until implemented; do not ship dead navigation links.

## Employee home composition

Top: greeting without private data, business date/zone, and last-updated status. First row: today's attendance state and one capture action, leave balance with available versus pending clearly separated. Second row: pending tasks and latest published payslip period. Third row: approved announcements. On mobile the same order becomes a single column. No salary amount on a shared-device landing view by default.

Attendance states are “Not recorded”, “Checked in”, “Checked out”, “Needs review”, and “Unavailable”. Offline or unconfirmed capture displays a pending/failure state and never a successful punch. Capturing requests only the approved location evidence for that action, with a visible explanation and alternate regularization path when permission is denied.

## People and employee detail

Directory rows: name, role/designation, department, location, work contact where allowed. HR table may add employment status and joining date. Bank accounts, government identifiers, birth dates, personal contacts, and salary are excluded from directory results and client payloads.

Filters are URL-backed and validated server-side. Search submission navigates to the page data layer; typeahead is not required. Detail tabs are links/server segments so inactive private tabs do not preload their data. Employment timeline shows effective date and recorded date for retroactive changes. Sensitive edits show reason, effective date, impacted downstream period, and independent verification when required.

## Leave and approvals

Leave form fields: type, start/end dates, day portions, reason, permitted attachment. Show policy-derived chargeable units, holidays/weekends treatment, projected available balance, approver path, and requested dates before submission. The server recalculates all values. Display a receipt/reference after durable submission.

Approval review shows employee, request dates, policy version, overlap warnings, balance impact, and request history. Reject requires a reason. A delegated decision clearly identifies delegation. If another approver already acted, show the current authoritative state and remove stale actions. Bulk leave approval is deferred until safe per-item review rules exist; payroll approval is never a table bulk shortcut.

## Payroll workbench

Step layout: **Inputs → Validation → Calculation → Review → Approval → Publication → Payment reconciliation**. Keep current state and period always visible. Operator and approver have different permitted commands; no action button fabricates a successful transition.

Validation separates blockers from warnings. Variance review compares employee/component values against prior period and expected compensation, with explanations for joiners, exits, LOP, arrears, and policy changes. Totals show earnings, employee deductions, employer contributions, and net separately. Rows link to calculation traces and snapshots. Approval confirmation states pay group, period, employee count, net total, and immutable digest. Published and paid statuses are distinct.

Download controls explain artifact expiration without revealing storage URLs. A payment export screen labels “Creates a bank file; does not send payment”. Reconciliation supports partial failures per employee and preserves original export references.

## Documents, requests, reports

Upload shows allowed formats/10 MiB limit, progress, quarantine/scanning, clean, rejected, or failed. No preview before clean scan. A document error is not an excuse to expose the raw object URL. Helpdesk categories mark confidential routing before submission. Reports show filters, included scope, generated time, freshness, row count, and expiry. Large exports use jobs; the screen remains usable while generation runs.

## State matrix for every screen

| State | Required rendering |
| --- | --- |
| Loading | Matching title/card/table skeleton; stable controls where safe; one polite loading announcement |
| Empty | Specific reason, relevant first action, retained filter controls |
| Filtered empty | “No results match these filters” and clear/reset action |
| Partial failure | Failed section's inline recovery; independent sections remain available |
| Validation failure | Error summary focuses first invalid field; entered values retained only in permitted transient state |
| Unauthorized | Generic safe denial; no hidden content in DOM/React payload |
| Stale conflict | Explain changed record; reload authoritative data before resubmit |
| Offline | Persistent connection status; blocked sensitive commands; no stale balance presented as current |
| Success | Durable resulting state, timestamp/reference; toast may supplement |

## Accessibility and responsiveness

Use one main landmark, skip link, hierarchical headings, real buttons/links, properly associated descriptions, and meaningful table headers. Dialog dismissal cannot discard a pending financial command silently. Focus moves to confirmation/error only when appropriate; route changes place focus predictably. Charts include equivalent tables and do not encode values only by color.

At 360px, filters stack and low-priority table fields move into details. Do not hide required data permanently. Horizontally scroll wide payroll tables inside a labeled region; never allow the whole page to overflow. At 200% zoom all actions remain reachable. Use the dimensions and test matrix in [size management](size-management.md).
