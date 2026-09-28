# Product requirements document

Status: proposed product baseline · Owner: Product Owner + HR Operations · Updated: 2026-09-28

## Outcome

GTF HR will give employees a reliable place to manage work records and give HR/Finance a reconciled, auditable process from joining through final settlement. Quality means correct pay, understandable policies, protected personal information, fast daily workflows, and recoverable operations.

GTF's website describes a real estate branding and digital marketing business with services including strategy, creative work, websites, and performance marketing. Multi-location support and possible client-site work are product design inferences, not verified employment arrangements. [Company source](https://www.gtftechnologies.com/)

## Users and authority

| Persona | Primary tasks | Default scope |
| --- | --- | --- |
| Employee | Own attendance, leave, payslips, profile changes, requests | Own employment; safe company directory |
| Reporting manager | Team exceptions, approvals, roster | Assigned team, effective-date aware; no team salary by default |
| HR operations | Employee lifecycle, policy assignment, documents | Assigned entities/locations and permitted fields |
| Payroll operator | Input validation, draft calculation, reconciliation | Assigned pay groups; cannot approve own run |
| Payroll approver / Finance | Variance review, approval, payment export | Explicit payroll approval scope |
| IT administrator | Identity provisioning, integrations, infrastructure | No default salary or personnel-document access |
| Auditor | Approved reports and immutable history | Read-only, scoped, time-limited access |
| Leadership | Workforce and cost summaries | Authorized aggregates; no default unrestricted records |

The platform-admin role does not imply routine payroll access. Separate privileged roles and approval assignments prevent self-approval even when one person holds several roles.

## Release scope and acceptance

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| HR-01 | Identity, MFA, scoped access, audit | All role/record/field denial cases pass; revocation stops active access |
| HR-02 | Organization and employee master | Effective-dated employment change preserves historical reports; duplicate import is rejected |
| HR-03 | Employee self-service and directory | Employee sees only own private data; directory excludes bank/tax/contact-private fields |
| HR-04 | Attendance and shifts | Duplicate, late, missing, overnight punches reconcile with visible provenance |
| HR-05 | Leave and approval workflows | Concurrent approvals cannot overspend balance; delegation never permits self-approval |
| HR-06 | Payroll and published payslips | Two shadow cycles reconcile per employee/component; approval and publication are distinct |
| HR-07 | Documents and lifecycle | Quarantined upload is inaccessible; joining/exit task ownership and completion are audited |
| HR-08 | Helpdesk and announcements | Category-based confidential queues; scheduled announcements respect audience scope |
| HR-09 | Reports and imports/exports | Counts/totals reconcile; export access rechecked at download and all exports audited |
| HR-10 | Expenses and reimbursement | Duplicate claim detection, manager/Finance approval, single settlement reference |
| HR-11 | Performance cycles | Visibility and release dates protect unreleased feedback; salary changes require separate approval |
| HR-12 | Recruitment and onboarding | Candidate access/retention differs from employee access; hire conversion creates one linked identity |
| HR-13 | Responsive web and PWA | Key ESS flows work at 360px; no private offline cache; install shell safely updates |
| HR-14 | Native applications | Shared API permissions pass parity checks; secure token storage and revocation verified |
| HR-15 | Optional governed assistant | Read-only permission-filtered retrieval first; no autonomous payroll/HR decisions |
| HR-16 | Operations and recovery | Restore drill, alert delivery, rollback rehearsal, and support ownership verified |

HR-01 through HR-07, HR-09, HR-13, and HR-16 form the core release, sequenced by [phases](phases.md). HR-08, HR-10 through HR-12, HR-14, and HR-15 follow only after core acceptance. An online responsive interface is required before optional PWA installation.

## Key workflows

**Join:** approved hiring/onboarding record → identity match → employment creation → manager/location/policy assignment → document tasks → access invitation → payroll eligibility review. Missing documents are explicit blockers only where an approved policy requires them.

**Daily attendance:** capture event → validate source and active employment → preserve raw event → derive day against assigned shift/policy → surface exceptions → employee requests correction → authorized approval → recompute unlocked period. Missing punches create exceptions, not automatic deductions.

**Leave:** display versioned availability → request dates/units → reserve balance transactionally → route to effective approver → approve/reject → consume/release reservation → update attendance input. Closed payroll corrections use adjustments.

**Month end:** input cut-off → reconcile exceptions → freeze inputs and rule versions → calculate → review employee/component variance → independent approval → publish payslips → approved bank export → external payment → reconcile outcome. Published is not paid.

**Exit:** resignation → HR acceptance → notice and clearance tasks → asset return → final-settlement calculation and approval → effective access revocation → documented delivery of permitted exit records. Rehire retains prior employment history.

## Policy configuration

HR must supply working calendars, holiday sets, leave types/eligibility/accrual/carry-forward, breaks, shift grace, overtime approval, working-location rules, correction windows, and delegation rules. Finance supplies compensation components, proration, pay groups, cut-off rules, statutory applicability, payment format, and approved rounding. Every policy has effective dates, author, approver, version, affected population, and preview of impact.

Configuration cannot contain unrestricted executable scripts. Policy revisions do not retroactively alter closed outputs. Retroactive changes produce a reviewable recalculation/adjustment proposal.

## Targets and constraints

Use the free/open-source self-hosted baseline in [tech stack](tech-stack.md), with license/cost boundaries in [free resources](free-resources.md). Iconsax is explicitly required and its exact artifact/artwork rights remain a visible installation gate. No required paid SaaS/API, premium UI kit or trial dependency. Infrastructure and staffing still need a resource plan. [User flows](user-flow.md) and [roles/permissions](roles-permissions.md) refine acceptance; [frontend/backend alignment](frontend-backend-alignment.md), [reusable components](reusable-components.md), and [state management](state-management.md) define implementation responsibilities.

Targets are unmeasured until a pilot: 100% reconciliation of employee/component payroll differences or signed explained adjustments; ≥90% completion of eligible self-service tasks without HR intervention; ≥99.9% monthly critical-service availability; zero confirmed unauthorized disclosure; ≥95 Lighthouse performance on representative builds; p75 LCP ≤2.5s and INP ≤200ms on the declared test cohort.

Planning capacity: synthetic 500-employee pilot, 5,000 employees and 500 concurrent sessions in load qualification, attendance peak 100 events/second for 10 minutes. Confirm real volumes before capacity commitments. No claim of “world's best” substitutes for these acceptance measures.

## Explicit exclusions at launch

Advertising, public HR profiles, automated bank transfers, government filing automation, continuous employee location tracking, facial recognition, social scraping, productivity scoring, AI-driven employment decisions, and a public multi-tenant marketplace. Optional integrations require their own contract and acceptance gate.

## Product risks and resolution

| Risk | Resolution / owner |
| --- | --- |
| Missing or contradictory policies | Versioned policy workshop and sign-off / HR |
| Statutory changes | Effective-dated rule register and qualified review / Finance |
| Incorrect migration | Dry run, row-level reconciliation, rollback / Data Owner |
| Small team lacks separation of duties | Named independent approver before payroll go-live / Sponsor |
| Network/device issues at attendance peak | Alternate auditable capture and regularization / HR + Engineering |
| Salary disclosure via logs/cache/exports | Field minimization, isolation tests, controlled downloads / Security |

Business discovery items and scope changes are recorded in [decisions](decisions.md). No exact GTF headcount, statutory registration, leave quota, retention duration, or payroll formula has been confirmed.
