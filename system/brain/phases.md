# Delivery phases — 7 phases, step by step

Status: full-system phases planned; FE1 frontend foundation implemented separately under completion/ · Owner: Product + Engineering Lead · Updated: 2026-09-28

There are **7 phases: P0, P1, P2, P3, P4, P5 and P6**. P0–P4 deliver the qualified core HR system; P5 extends HR modules; P6 is optional native/assistant work. The required stack is free/open-source and self-hosted, with the Iconsax artifact/license check explicitly recorded in [tech stack](tech-stack.md) and [free resources](free-resources.md).

## Scheduling rule

Sequence by evidence and dependency, not an invented launch date. Effort and calendar estimates are assigned after team capacity, policies, integration access, infrastructure budget, and migration size are known. Each phase requires an accountable owner and an exit review; overlap independent work only when upstream contracts are stable.

| Phase | Outcome | Included microtasks | Entry / exit gate |
| --- | --- | --- | --- |
| P0 — Discovery and policy baseline | Verified business inputs and implementation decisions | MT-001–003 | Entry: this documentation. Exit: owners, policies, sources, assumptions, vendor/region constraints approved |
| P1 — Secure foundation and Core HR | Working accessible web shell, identity, employee source of truth, CI | MT-004–014 and MT-031 | Exit: scoped reads/writes, migration dry run, private files/audit, architecture checks, critical CI green |
| P2 — Time, leave, and ESS | Employees and managers complete daily tasks safely | MT-015–022 | Exit: attendance edge cases and concurrent leave approvals pass; online pilot data reconciled |
| P3 — Payroll shadow mode | Reproducible, independently reviewed payroll | MT-023–030 | Entry: HR-approved time/leave inputs. Exit: two consecutive shadow cycles reconcile; no live payment automation |
| P4 — Production qualification and pilot | Recoverable, measured, supported core release | MT-032–036 and MT-041 | Entry: P1/P2/P3 evidence. Exit: production checklist, staged cohort acceptance, restore/rollback, private-cache tests |
| P5 — Extended employee lifecycle | Helpdesk, expenses, performance, recruitment | MT-037–040 | Entry: stable core and approved domain policies. Exit: each module's scope/privacy/settlement tests and UAT |
| P6 — Native and governed assistance | Optional native ESS and read-only knowledge help | MT-042–043 | Entry: measured need, budget, device/AI governance. Exit: parity/security evaluation and controlled rollout |

PWA MT-041 follows tested online ESS and can be developed alongside production qualification. Basic responsive mobile web is delivered in P1/P2. Native and AI are not prerequisites for the core HR system. Advertising and recurring scraping have no active delivery phase.

## P0 steps — discovery and policy baseline

Owners: Product, HR, Finance, Privacy, IT and Engineering. Tasks: MT-001–003. Input: company stakeholders and the current documentation.

1. Name product/data/security/support owners and independent payroll operator/approver; confirm internal GTF scope.
2. Verify legal entities, employees/contractors, locations, hierarchy, calendars and cost centers. Record source IDs and ownership.
3. Document attendance, shift, break, leave, accrual/carry-forward, correction-window, approval and delegation rules with expected examples.
4. Finance documents compensation, proration, rounding, cut-off, statutory coverage, existing payroll process and final settlement; review official effective-date sources.
5. Inventory source exports/devices/documents, purposes, retention, privacy notices and migration reconciliation requirements. Create synthetic fixtures.
6. Review FOSS stack, exact version compatibility and Iconsax package/artwork provenance. Inventory company compute/network, independent backup location and isolated CI capacity; no paid trial is assumed.
7. Define role/permission matrix, employee journeys, supported devices, rollout cohorts, success/recovery targets and owned resource gaps.
8. Baseline the policy/source/retention registers and stack ADR. Give unresolved questions an owner and blocking scope rather than inventing answers.

Deliverables: validated discovery inputs, policy fixtures, role matrix, stack/license decision and resource plan. Gate: required owners/inputs for the next slice are recorded; missing payroll rules block payroll activation, not unrelated synthetic UI work.

## P1 steps — secure foundation and Core HR

Owners: Engineering, Design, Identity, Security and Data. Tasks: MT-004–014 and MT-031. Technologies: Next.js/React/TypeScript, Tailwind/Radix/Iconsax, Zod, PostgreSQL/Drizzle, Keycloak, pg-boss and Forgejo.

1. Scaffold strict TypeScript/Next.js and the page/section/UI boundaries. Pin pnpm/runtime versions and create root loading/error/global-error states.
2. Start Forgejo/Runner CI immediately: lint, typecheck, tests and production build. Keep scripts portable and untrusted runners isolated.
3. Build design tokens, controlled primitives, verified Iconsax adapter, both themes, responsive skeletons, keyboard focus and reduced motion.
4. Integrate Keycloak OIDC, revocable sessions, MFA/step-up, logout and account lifecycle. Implement centralized role/record/field checks.
5. Establish Zod/OpenAPI contracts, error shapes, concurrency guards and idempotency. Create PostgreSQL schema, RLS and reviewed Drizzle/SQL migrations.
6. Implement transactional audit/outbox, dispatcher and pg-boss worker with bounded retries and crash/replay tests.
7. Deliver employee directory/detail/history and HR create/edit flows. Pages fetch authorized DTOs; sections render layout and UI receives props.
8. Add private SeaweedFS uploads, ClamAV quarantine and authenticated downloads; verify required capabilities in the selected OSS build.
9. Build staged imports with row validation, mapping, dry-run totals, reviewer commit and duplicate-safe reruns.
10. Complete role-aware navigation/ESS shell and inspect HTML/React/API payloads for private-field leaks. Demonstrate one authorized employee flow and explicit denied flows.

Deliverables: runnable synthetic Core HR, secure identity/data/files, CI and contract evidence. Gate: T-01–06, T-17, relevant T-20/T-30 and responsive/accessibility checks pass. A static dashboard does not complete this phase.

## P2 steps — attendance, leave and ESS

Owners: HR, Integration, Backend, Frontend and QA. Tasks: MT-015–022. Input: secure Core HR and approved relevant policies.

1. Implement versioned calendars/shifts, timezone and overnight business-date rules; reject overlapping assignments.
2. Capture immutable raw punches from online self-service and approved devices. Record source/receipt timestamps, deduplicate and quarantine unmapped identities.
3. Derive attendance projections and exception queues; add regularization with approved correction history, never overwritten raw events.
4. Build leave accounts and exact ledger postings for accrual, reservation, consumption, release, reversal, carry-forward and expiry.
5. Add manager/HR workflow, delegation/escalation, cancellation and stale-version conflict handling. Test simultaneous requests for the last leave unit.
6. Build responsive employee dashboard, leave request/history, attendance and approval queues with policy explanations and all async states.
7. Add scoped reports, async formula-safe CSV, expiring downloads and fresh authorization at download time.
8. Add onboarding/exit tasks, asset custody, effective access revocation and rehire identity links.
9. Reconcile a representative synthetic working period with HR; test missing/overnight/late punches, half-days, holidays, manager changes and cancellations.

Deliverables: working daily employee/manager workflows and trustworthy time/leave inputs. Gate: T-07–11, T-18, relevant T-20–21/T-26–27 pass; unresolved attendance is an exception, not an automatic deduction.

## P3 steps — payroll shadow qualification

Owners: Finance, Payroll Engineering, QA and Security. Tasks: MT-023–030. Technologies: decimal.js, PostgreSQL snapshots, workers and isolated PDF rendering.

1. Configure pay groups, components, compensation histories and a safe dependency graph separating employee deductions from employer costs.
2. Create effective-dated statutory/rounding rules with official evidence, qualified review and independent expected fixtures. Missing coverage blocks calculation.
3. Implement input cut-off/readiness, immutable time/leave/compensation/rule snapshots and digest; route late changes to adjustments.
4. Build deterministic exact-decimal calculations and component traces. Reject partial failed runs and reconcile per employee before totals.
5. Deliver payroll validation/variance workbench with maker/checker approval, expected versions and approved digest.
6. Generate verified payslips from approved internal templates in a constrained worker. Publish only complete approved artifacts and enforce own-document access.
7. Implement bank export and unique settlement intents, then external/partial acknowledgment reconciliation. Exporting does not transfer money or mark paid.
8. Test retroactive changes, arrears, leave adjustments, reversals, negative net and final settlement without changing approved history.
9. Run shadow payroll period one against the incumbent process; resolve every unexplained component difference.
10. Run the next consecutive shadow period and get Finance sign-off. A rerun of the first period is not a second shadow cycle.

Deliverables: explainable payroll, independent approval, payslips, payment-export reconciliation and two signed shadow reports. Gate: T-12–16 and Finance reconciliation pass; no live payroll while applicability or unexplained variance remains unresolved.

## P4 steps — production qualification and pilot

Owners: Operations, Security, QA, HR, Finance and Product. Tasks: MT-032–036 and MT-041. Technologies: Podman/Caddy, OSS monitoring, pgBackRest/restic, PWA and test tools.

1. Prepare pinned web/worker artifacts and self-hosted deployment; isolate CI, production credentials, identity, data and backup failure domains.
2. Implement PWA manifest/icons, public-only asset cache, safe update behavior and generic offline screen after online ESS works.
3. Qualify route weights and representative synthetic load, including attendance bursts during payroll; record actual measurements.
4. Review authorization, private caching, secrets, uploads, exports, retention, dependencies and license/SBOM evidence; fix blocking issues.
5. Configure redacted telemetry, protected dashboards and alert escalation to named operators; test receipt and acknowledgment.
6. Restore DB/objects/configuration/keys from independent backups, reconcile jobs/payments/deletions and measure RPO/RTO. Rehearse compatible application rollback.
7. Run UAT on supported screens/devices, keyboard/screen reader, both themes and degraded connections; train HR/Finance/support.
8. Complete the production checklist and record software-license versus hardware/mail/staffing cost boundaries. Free software does not waive security or recovery gates.
9. Launch a small approved cohort, observe SLOs/support and reconcile critical business events. Stop expansion on data leakage, duplicate postings or unexplained pay differences.
10. Expand by accepted cohort/location; preserve incumbent fallback and independent review of the first live payroll.

Deliverables: operational deployment, test/license evidence, recovery/rollback report and accepted cohort. Gate: T-25–27/T-30–32 and all applicable production checks pass. A single unbacked host is not enterprise readiness.

## P5 steps — extended employee lifecycle

Owners: HR, Finance, Recruiting, Product and Engineering. Tasks: MT-037–040. Reuse the same free/open-source stack.

1. Prioritize actual support/business needs and approve each module's data purposes, policy and retention.
2. Add confidential helpdesk categories, scoped assignment, messages and safe attachments; add audience-based scheduled announcements.
3. Add expense claims, receipt checks, manager/Finance approval and one traceable reimbursement path.
4. Add performance goals/cycles, self/manager reviews, calibration and controlled release. Keep compensation changes separately approved.
5. Add candidate/application/offer stages, restricted retention and verified hire conversion without duplicate identities.
6. Extend authorized reports using existing jobs/exports and safe aggregate visibility.
7. Test T-19/T-22–24, then release modules independently behind flags with targeted UAT.
8. Review usage, support, disclosure risks and financial reconciliation before expanding scope or adding dependencies.

Deliverables: individually accepted extended modules. Gate: every enabled module satisfies domain/security/retention tests; deferred modules do not invalidate the accepted core release.

## P6 steps — optional native and read-only assistance

Owners: Product, Mobile, Security, Privacy and Operations. Tasks: MT-042–043. Entry: measured need, resources and separate ADRs.

1. Identify needs not met by the web/PWA and decide whether benefits justify native/AI operating complexity.
2. Evaluate React Native/TypeScript and native Iconsax adapter, device support, dependency licenses and distribution terms. Keep web/PWA as the baseline without mandatory store services.
3. Build a small native ESS flow against the same versioned APIs; retain server-side domain rules and central mobile networking.
4. Test device/token revocation, denied permissions, weak network, links, updates and role parity before distribution.
5. For assistance, evaluate locally operated runtime/model artifacts and their separate licenses, hardware needs and privacy controls. Keep disabled if the agreed free/OSS constraint cannot be met.
6. Implement approved-policy retrieval with permission filtering, sources and inability-to-answer behavior. No payroll execution, arbitrary SQL or autonomous employee decisions.
7. Test injection, unauthorized retrieval, stale evidence, misleading responses and resource exhaustion.
8. Pilot native and assistance independently with T-28/T-29 and owned support; defer either feature if it adds no clear value.

Deliverables: only optional features that pass license, device, security and operational acceptance. Gate: no hidden paid API/cloud-build/store dependency; the core remains usable without P6.

## Detailed exit criteria

**P0:** HR confirms legal entities, locations, employment categories, hierarchy, calendars, leave/attendance rules, and source owner. Finance confirms current payroll process and who can independently approve. Privacy confirms data inventory/retention review. Engineering records supported stack/IdP/hosting choices and baseline costs. Open blockers have owners and dates; unknown statutory rules cannot be marked resolved by a sample formula.

**P1:** A real synthetic employee can sign in, see only authorized fields, and request an approved profile change. HR can create and effective-date an employment assignment. Import dry-run errors are reviewable. File quarantine, revocation, audit/outbox, page-owned fetching, skeletons/errors, themes, and CI controls work in staging. No production employee data yet.

**P2:** Duplicate/overnight/missing punches are handled deterministically; source outages show stale status. Leave reservations and cancellation preserve balances under concurrency. Manager delegation and team scope pass denial tests. ESS and reports match authoritative inputs. Basic onboarding/offboarding and identity revocation work.

**P3:** Every active rule is reviewed, exact payroll traces exist, input/rule snapshots reproduce results, maker/checker controls enforce independence, payslips remain unpublished until approval, exports cannot falsely mark paid, and Finance signs both shadow periods. Live payroll is blocked until this gate.

**P4:** Synthetic qualification demonstrates scale/performance budgets, security review finds no blocking issue, recovery/rollback drills pass, on-call/support owners are assigned, and users complete UAT. Enable a representative small cohort first, then expand by entity/location with reconciliation and support review between steps. Record real cohort sizes after discovery.

**P5:** Each module has separate product acceptance. Expenses use one approved settlement path; performance review release respects confidentiality; candidate data has purpose/retention and controlled hire conversion. Avoid making the entire expansion phase one all-or-nothing release.

**P6:** Native app uses the same server permissions and current compatibility policy. Assistant starts with approved policy Q&A and permission-filtered retrieval; no autonomous employee decisions, payroll execution, or arbitrary SQL/tools. Any future action capability needs an explicit new decision and human confirmation design.

## Rollout and rollback

Use environment-level and role/cohort feature flags for unfinished modules, default off. Authorization remains in services regardless of flags. Keep the incumbent payroll process available through shadow cycles and initial live verification. A rollback must not erase valid attendance/leave commands already committed; reconcile and correct instead.

Stop expansion on unauthorized disclosure, unexplained payroll variance, failed recovery, duplicate postings, or severe availability regression. Product/Finance/Security determine whether an unaffected module can continue. [Operations](operations.md) and [production checklist](production-checklist.md) contain exact runbooks and launch gates.

## Completion reporting

Documentation completion is recorded separately from P0 discovery sign-off. Update [tasklist](tasklist.md) at requirement level and [microtasks](microtask.md) at implementation level. No phase is marked complete in this initial specification release.
