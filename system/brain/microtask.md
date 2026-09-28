# Microtask execution backlog

Status: all tasks todo · Owner: Engineering Lead · Updated: 2026-09-28

Each row is a bounded work package with a reviewable output. Split any row into numbered children before coding if it exceeds one reviewable change; preserve its ID as the parent. IDs are stable, not chronological priorities. Dependencies define ordering; MT-031 belongs early in P1 despite its later number. Owner labels are roles awaiting named assignment.

| ID | Phase / owner | Depends on | Concrete work / output | Done when |
| --- | --- | --- | --- | --- |
| MT-001 | P0 / HR + Product | None | Inventory entities, people categories, hierarchy, calendars, leave/attendance/approval policies, source owners | Versioned policy workbook and open-question register reviewed by HR |
| MT-002 | P0 / Finance + Privacy | MT-001 | Build statutory applicability, payroll-input, processing-purpose, and retention registers | Qualified reviewers record effective sources, scope, missing items, and approval path |
| MT-003 | P0 / Engineering + IT | MT-001 | Validate the free/OSS stack, exact supported versions/licenses, Keycloak, company-hosted environments, backup topology and resource/on-call assumptions | ADR with license/provenance evidence, real resource costs, owners and recovery feasibility |
| MT-004 | P1 / Frontend | MT-003 | Scaffold Next.js/TypeScript directories, strict compiler/lint/import rules, root loading/error/global-error, metadata | Production build/typecheck pass; client-in-page and component-fetch imports fail lint fixtures |
| MT-005 | P1 / Design + Frontend | MT-004 | Implement logo/tokens, Radix-backed controlled primitives, required Iconsax adapter, reusable component catalog and light/dark gallery | Exact Iconsax package/artwork rights/types/React/tree-shaking verified; contrast/keyboard/size checks pass |
| MT-006 | P1 / Identity | MT-004, MT-003 | Integrate self-hosted Keycloak via openid-client, server session/membership mapping, MFA/step-up and revocation | T-03 passes; no secrets in browser; sign-in/logout/recovery acceptance |
| MT-007 | P1 / Backend + Security | MT-006 | Implement centralized capability/record/field scope evaluator and DTO projection | T-01–03/T-06 pass for all initial roles including direct API calls |
| MT-008 | P1 / API | MT-004, MT-007 | Create OpenAPI 3.1, runtime schemas, generated DTOs, errors, cursors, idempotency protocol | Contract tests reject malformed/unauthorized input and replay commands safely |
| MT-009 | P1 / Backend | MT-003, MT-007 | Add migrations for organization/employment, composite FKs, effective histories, RLS and indexes | Fresh/upgrade migrations pass; T-02/T-04/T-05 constraint cases pass |
| MT-010 | P1 / Backend + Frontend | MT-005, MT-008, MT-009 | Employee create/detail/directory with page-owned reads and effective-dated assignments | HR can create synthetic employee; own/team/private DTO scenarios pass |
| MT-011 | P1 / Data | MT-009, MT-012, MT-013 | Build staged CSV import, schema mapping, row errors, reviewer commit, deduplicated re-run | Dry-run and repeated commit reconcile counts/balances; T-05/T-20 pass |
| MT-012 | P1 / Platform + Security | MT-007, MT-009, MT-013 | SeaweedFS OSS private uploads, ClamAV quarantine, document metadata and authenticated download | Required OSS storage/scan capabilities verified; T-17 passes for MIME, grant, malware and revoked scope |
| MT-013 | P1 / Backend | MT-009 | Audit writer, transactional outbox, leased jobs, retry/dead-letter inspection | T-30 passes; domain write/audit/outbox atomic; replay does not duplicate effect |
| MT-014 | P1 / Frontend | MT-005, MT-006, MT-010 | Workspace/ESS shell, permitted navigation, page-local data helpers, route skeleton/error states | T-26/T-27 pass; no private shell leakage or duplicate rendering fetches |
| MT-015 | P2 / HR + Backend | MT-001, MT-009, MT-013 | Versioned calendars/shifts, overnight semantics, roster/assignment validation | Fixtures demonstrate correct business-date assignment and overlap rejection |
| MT-016 | P2 / Integration | MT-008, MT-013, MT-015 | Durable web/device raw attendance ingestion and source reconciliation | T-07 passes at duplicate/out-of-order receipt; unmapped employees quarantined |
| MT-017 | P2 / Backend + Frontend | MT-016 | Attendance projection, exception UI, regularization commands and audit links | T-08 passes; missing punch never silently becomes deduction; correction preserves raw event |
| MT-018 | P2 / Backend | MT-001, MT-009, MT-013, MT-015 | Leave policy/accrual, reservation ledger, overlap rules, carry-forward/expiry | T-09/T-11 pass; exact balances survive races/replays/year boundary |
| MT-019 | P2 / Backend + Frontend | MT-007, MT-013, MT-018 | Versioned workflow, manager/delegate review, escalation, cancellation/reversal | T-10 passes; no self-approval; stale decisions cannot post twice |
| MT-020 | P2 / Frontend + QA | MT-014, MT-017, MT-019 | Employee dashboard, leave form/history, attendance and approval views | Full own/team journeys pass on 360px and desktop in both themes |
| MT-021 | P2 / Reporting | MT-008, MT-010, MT-013, MT-019 | Scoped report catalog, async export, expiry, formula-safe CSV, freshness indicators | T-20/T-21 pass including rights removed while job runs |
| MT-022 | P2 / HR + Identity | MT-006, MT-010, MT-012, MT-019 | Basic onboarding/offboarding tasks, asset custody, effective revocation, rehire link | T-18 passes; exit retains lawful history and revokes access at approved time |
| MT-023 | P3 / Payroll | MT-002, MT-009, MT-013 | Pay groups, component dependency graph, compensation versions, safe formula validation | Overlap/cycle/unsupported component checks and exact-decimal fixtures pass |
| MT-024 | P3 / Finance + Payroll | MT-002, MT-023 | Effective-dated statutory rules with source, jurisdiction, reviewer, and fixtures | Finance approves each supported version; missing coverage blocks run |
| MT-025 | P3 / Payroll | MT-017, MT-018, MT-023, MT-024 | Cut-off readiness, immutable payroll input/rule snapshots, digest and period locking | Same cut-off yields identifiable frozen inputs; late changes become adjustments |
| MT-026 | P3 / Payroll + QA | MT-025 | Deterministic calculation worker, traces, result/line storage, rounding and variance | T-12/T-13 pass; failed partial batch cannot become reviewable |
| MT-027 | P3 / Finance + Frontend | MT-026, MT-019 | Payroll workbench, readiness/variance review, independent approval, digest checks | T-14/T-15 pass; operator cannot approve own run; stale snapshot rejected |
| MT-028 | P3 / Payroll + Documents | MT-027, MT-012 | Safe payslip rendering, artifact validation, publish command, own ESS download | Approved amounts match PDF; no premature/other-employee download |
| MT-029 | P3 / Finance + Integration | MT-027, MT-021 | Verified bank export, unique settlement intents, partial acknowledgment reconciliation | T-16 passes; re-export/retry never records duplicate payment; no transfer automation |
| MT-030 | P3 / Finance + QA | MT-026–029, MT-011 | Execute two consecutive shadow payroll periods and final-settlement/adjustment fixtures | Signed per-employee/component differences register contains no unexplained variance |
| MT-031 | P1 / DevOps | MT-004 | Create protected Forgejo repository/Runner CI, portable scripts, pinned actions, SBOM/license checks and safe synthetic previews | Required checks run without GitHub/paid services; fork jobs lack secrets; controlled release/provenance path rehearsed |
| MT-032 | P4 / Performance + QA | MT-020, MT-028, MT-031 | Representative route/load qualification with agreed concurrency/data and bundle caps | Measured reports meet budgets or approved bounded exceptions; no integrity regression |
| MT-033 | P4 / Security | MT-007, MT-012, MT-021, MT-029, MT-041 | Threat-model review, authorization/cache/upload/SSRF/secret tests, independent assessment | No blocking security finding; retention/privacy evidence reviewed |
| MT-034 | P4 / Operations | MT-013, MT-029, MT-031 | Provision alerts/backups, restore DB+objects+keys, replay audit/deletion/payment reconciliation, rollback | T-30–32 pass and achieved RPO/RTO/alert acknowledgment recorded |
| MT-035 | P4 / HR + QA + Finance | MT-030, MT-032–034 | User acceptance, accessibility/manual device review, training/support and launch checklist | Named owners sign all relevant production gates with evidence |
| MT-036 | P4 / Product + Operations | MT-035 | Stage pilot cohort, observe support/SLOs, reconcile first live workflows, expand deliberately | Cohort acceptance recorded; incidents resolved; no unexplained financial discrepancy |
| MT-037 | P5 / HR + Frontend | MT-036, MT-019, MT-012 | Confidential helpdesk routing and audience-based scheduled announcements | T-19 passes; notification payloads do not expose private content |
| MT-038 | P5 / Finance + Backend | MT-036, MT-019, MT-029 | Expense receipts, duplicate detection, two-stage approval and one reimbursement path | T-22 passes with rejected/partial/duplicate/replayed settlement cases |
| MT-039 | P5 / HR + Product | MT-036, MT-007, MT-019 | Goals, review cycles, role visibility, calibration/release policy | T-23 passes; unpublished feedback and salary actions remain separate |
| MT-040 | P5 / Recruiting + Backend | MT-036, MT-022, MT-012 | Candidate/application/offer pipeline, restricted retention and identity-safe conversion | T-24 passes; conversion preserves audit without duplicate employee |
| MT-041 | P4 / Frontend + Security | MT-020, MT-028, MT-031 | Manifest/icons, public-only service-worker cache, offline page and safe update UX | T-25 passes across logout/relogin/offline/update; no private persistent cache |
| MT-042 | P6 / Mobile + Security | MT-036, MT-008, native ADR | Validate React Native/TypeScript, native Iconsax and platform/distribution license/cost boundaries; implement justified ESS with secure tokens | T-28 and role parity pass on physical devices; core delivery needs no paid store/build service |
| MT-043 | P6 / Product + Security | MT-036, MT-007, assistant ADR | Optional read-only policy retrieval with source citations, ACL enforcement and evaluation | T-29 passes; no autonomous writes, arbitrary SQL, or vendor training on HR data |

## Required task record

Use the paired responsibilities in [frontend/backend alignment](frontend-backend-alignment.md). Frontend fixtures/props must match the backend schema and permission contract. [State management](state-management.md) and [reusable components](reusable-components.md) apply to every web task. All dependencies follow [tech stack](tech-stack.md) and [free resources](free-resources.md); the Iconsax provenance check is part of MT-005, not permission to silently replace the requested icon family.

Each implementation task records requirement ID, owner, status, dependencies, changed files, schema/API impact, validation commands and result references, accessibility/performance evidence when affected, security considerations, rollout/rollback, reviewer, and completion date. Do not paste secrets or actual employee records into a task.

## Change sizing

Keep PRs reviewable by behavior. MT-026, for example, can split into engine arithmetic, snapshot loading, result persistence, traces, and Finance fixtures; all children must pass before the parent is done. Do not replace necessary transactional behavior with mock success simply to make a task smaller.

## Non-active requests

AdMob remains intentionally disabled. Optional scraping requires source onboarding and a new scoped task under [scraping spec](scraping-spec.md). Local passwords require the justification in [PWD](pwd.md). AI write actions, automated bank transfers, facial recognition, and commercial SaaS are not implicitly authorized by this backlog.
