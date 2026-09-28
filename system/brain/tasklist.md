# Tasklist — requirement-level backlog

Status: all application work pending · Owner: Product Owner · Updated: 2026-09-28

Checkboxes represent delivered, verified behavior, not the existence of a design document. Use [microtasks](microtask.md) and [frontend/backend alignment](frontend-backend-alignment.md) for execution. [User flows](user-flow.md), [roles and permissions](roles-permissions.md), [reusable components](reusable-components.md) and [state management](state-management.md) define each side's contracts. Status vocabulary: todo, in_progress, blocked (with cause/owner), in_review, done (with evidence). An unchecked item below is todo unless explicitly stated otherwise.

| Done | Requirement / epic | Phase | Microtasks | Acceptance tests |
| --- | --- | --- | --- | --- |
| [ ] | HR-01 — SSO, MFA, scoped access, audit | P1 | MT-006, 007, 013 | T-01–03, T-06 |
| [ ] | HR-02 — Organization and employee source of truth | P0–P1 | MT-001–003, 009–011 | T-04–05, T-20 |
| [ ] | HR-03 — Employee self-service and safe directory | P1–P2 | MT-010, 014, 020 | T-01, T-06, T-27 |
| [ ] | HR-04 — Attendance, shifts, exceptions | P2 | MT-015–017 | T-07–08, T-30 |
| [ ] | HR-05 — Leave ledger and approval workflow | P2 | MT-018–019 | T-09–11 |
| [ ] | HR-06 — Payroll, publication, reconciliation | P3 | MT-023–030 | T-12–16 |
| [ ] | HR-07 — Documents, onboarding, offboarding | P1–P2 | MT-012, 022 | T-17–18 |
| [ ] | HR-08 — Confidential helpdesk and announcements | P5 | MT-037 | T-19 |
| [ ] | HR-09 — Imports, reporting, controlled exports | P1–P2 | MT-011, 021 | T-20–21 |
| [ ] | HR-10 — Expenses and reimbursement | P5 | MT-038 | T-22 |
| [ ] | HR-11 — Performance cycles and release controls | P5 | MT-039 | T-23 |
| [ ] | HR-12 — Recruitment and hire conversion | P5 | MT-040 | T-24 |
| [ ] | HR-13 — Accessible responsive web, themes, PWA | P1–P4 | MT-004–005, 014, 020, 041 | T-25–27 |
| [ ] | HR-14 — Native ESS | P6 | MT-042 | T-01–03, T-28 |
| [ ] | HR-15 — Governed read-only assistant | P6 | MT-043 | T-29 |
| [ ] | HR-16 — CI/CD, service operations, recovery | P1–P4 | MT-031–036 | T-30–32 and full release matrix |

## First implementation slice

1. Complete MT-001–003 policy and platform discovery with accountable owners.
2. Scaffold MT-004 and CI MT-031 with strict boundary/type checks.
3. Build identity/scopes/schema and an employee-directory slice with real authorization, matching skeleton, empty/error states, and both themes.
4. Prove one employee can read their permitted own profile while another employee cannot access restricted fields through URL, API, or serialized payload.
5. Extend that verified pattern into attendance and leave before payroll calculation work.

This vertical slice must use synthetic data until migration/privacy gates are approved. A polished static dashboard does not close any functional epic.

## Blocker register

| Blocker / unresolved input | Owner role | Blocks |
| --- | --- | --- |
| GTF's actual legal entities, headcount, locations, employment policies | HR / Sponsor | Production configuration and migration |
| Payroll formulas, registrations, current process, independent approver | Finance | Live payroll and statutory rule activation |
| Keycloak/self-hosted OSS deployment, hardware/location/backup resources, team/on-call capacity | IT / Engineering / Sponsor | Infrastructure and delivery estimates |
| Exact Iconsax package/artwork provenance, release license and React compatibility | Frontend / Security | Icon dependency installation/distribution |
| Source exports, device API/contracts, bank format | Data / Integration / Finance | Integration and reconciliation |
| Processing purposes, retention register, notices, legal timing | Privacy / HR / Finance | Production personal-data processing |
| Brand vector asset and name confirmation | Marketing / Product | Final brand assets; not core schema work |
| Native business case and distribution approach | Product / IT | Native phase only |

These are discovery dependencies, not a request to stop writing specifications. The docs use explicit assumptions to let authorized design work proceed.

## Task completion protocol

For each epic, link merged commit/PR, migration/API changes, executed test IDs, visual/accessibility evidence where relevant, owner approval, and rollout state. A feature deployed behind a disabled flag is implemented but not necessarily accepted/released. Update [completed list](completed-list.md) and [changelog](changelog.md) only after the relevant evidence exists.
