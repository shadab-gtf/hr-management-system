# Decisions and open questions

Status: planning baseline · Owner: Product + Engineering Lead · Updated: 2026-09-28

“Adopted baseline” means used consistently in these specifications; it is not a claim of stakeholder approval or implemented behavior. “Proposed” requires technical/business validation before committing production resources. Superseded decisions remain in history with a link to the replacement.

## Architecture decision records

| ID / status | Decision and rationale | Consequence / revisit trigger |
| --- | --- | --- |
| ADR-001 / adopted baseline | Internal GTF HR first; one organization with scoped legal entities and future-safe organization keys | No commercial tenant onboarding/billing; revisit only for an explicit SaaS objective |
| ADR-002 / adopted baseline | Next.js server-first, strict TS, Page → Section → UI, centralized read adapters | Page-local async helpers compose Suspense; components never fetch; enforce via imports/lint |
| ADR-003 / proposed | TypeScript modular monolith + worker, self-hosted PostgreSQL/Drizzle, SeaweedFS OSS, Keycloak | Lower burden than early microservices; exact capacity/versions still require validation |
| ADR-004 / adopted baseline | Immutable employee identity + effective-dated employment/assignment/compensation | More deliberate migrations; rehire/retroactive changes remain auditable |
| ADR-005 / adopted baseline | Exact decimal payroll, frozen inputs/rules, independent approval, compensating adjustments | Cannot silently edit approved outputs; Finance fixtures and shadow cycles required |
| ADR-006 / proposed | pg-boss with PostgreSQL transactional outbox; no separate broker initially | Validate leases/replay/throughput and retain domain idempotency |
| ADR-007 / adopted baseline | Responsive web first, PWA shell next, native later | Offline private data/actions excluded initially; native business case required |
| ADR-008 / adopted baseline | No advertisements or AdMob SDK in internal HR | No advertising revenue model; revisit only through explicit separate-product review |
| ADR-009 / adopted baseline | No scraping of employee/HR operational data; optional public research quarantined | Rules cannot auto-update from crawled notices |
| ADR-010 / adopted baseline | SSO preferred; PWD interpreted as password/recovery plus separate PWA document | Local password implementation is conditional, not default |
| ADR-011 / adopted baseline | Preserve supplied logo colors; accessible semantic action shades and neutral surfaces | Brand tokens sampled, not official brand manual; vector source still needed |
| ADR-012 / adopted baseline | No private shared/browser/service-worker cache; minimized DTOs | Offline HR functionality limited; correctness/privacy prioritized |
| ADR-013 / adopted baseline | First bank integration creates reviewed export only | Export is not payment; automated transfers require separate product/security gate |
| ADR-014 / adopted baseline | AI later and read-only initially | No autonomous payroll, hiring, disciplinary action, arbitrary SQL, or unauthorized retrieval |
| ADR-015 / adopted baseline | Planning targets are not evidence of performance/compliance/readiness | Tests, reviews, and real measurements must precede production claims |
| ADR-016 / proposed | India-first INR/Asia-Kolkata defaults and synthetic 500→5,000 capacity fixtures | Verify jurisdictions/headcount; do not infer legal setup from public office list |
| ADR-017 / adopted user constraint | Required software is free/open-source and self-hostable, with no mandatory paid API/subscription/trial | Forgejo CI, community services, OSS monitoring/backups; resource costs remain explicit |
| ADR-018 / adopted user requirement; provenance pending | Iconsax is the required icon family; `iconsax-reactjs` is the current repository-documented candidate | Verify exact package/artwork rights, React support and bundle; no silent substitute or premium purchase |
| ADR-019 / adopted baseline | PostgreSQL/domain services own business state; React built-in local state and actions own interaction | Updated by ADR-021: TanStack Query is now user-selected; no Redux/Zustand/SWR or private persistent browser cache |
| ADR-020 / adopted baseline | Contract-first frontend/backend handoff, controlled reusable primitives, central server permissions | Separate user-flow, role, alignment, reuse and state documents guide all MT work |

## Open business/technical decisions

| ID | Question to resolve during discovery | Owner | Required before |
| --- | --- | --- | --- |
| OQ-01 | Exact registered employer entities, office locations, employee/contractor categories and counts? | Sponsor + HR | Production schema configuration/migration |
| OQ-02 | Working calendars, shifts, leave accrual/carry-forward, grace/break/LOP/OT policies? | HR | Attendance/leave policy activation |
| OQ-03 | Current payroll process, salary components, proration, rounding, registrations, statutory coverage? | Finance | Payroll rule fixtures and shadow cycles |
| OQ-04 | Named independent payroll approver and fallback for small-team absences? | Sponsor + Finance | Any payroll approval workflow |
| OQ-05 | Existing employee source exports, identity keys, historical data quality and migration window? | Data Owner + HR | Import implementation/cut-over |
| OQ-06 | Enterprise IdP, MFA enrollment, recovery support and offboarding ownership? | IT + Security | Identity integration |
| OQ-07 | Available company compute/network, self-hosted service topology, data/backup locations, resource budget and support capacity? | Sponsor + IT + Privacy | Infrastructure provisioning |
| OQ-08 | Device vendors, authenticated attendance integration, field/remote work policy? | HR + Integration | Source onboarding |
| OQ-09 | Approved bank file format, acknowledgment source, account verification process? | Finance | Payment export/reconciliation |
| OQ-10 | Record-class retention, legal holds, notices, request/complaint contact, current legal obligations? | Privacy + HR + Finance | Live personal-data processing |
| OQ-11 | Confirm product name, vector brand asset, font licensing, Hindi or additional languages? | Marketing + Product | Final branding/localization |
| OQ-12 | Does “PWD” mean passwords, PWA, or another requirement? | Product | Any extra feature implied by that acronym |
| OQ-13 | Native need, React Native candidate, Iconsax adapter, platform/distribution terms, device and browser support? | Product + IT | Optional native phase |
| OQ-14 | Support hours, on-call staffing, launch cohort and SLO commitments? | Operations + Sponsor | Production readiness |
| OQ-15 | Suitable local assistant runtime/model licenses, hardware, approved corpus, evaluation and deletion controls? | Product + Privacy + Security | Optional AI phase |
| OQ-16 | Does the exact Iconsax package and embedded icon provenance satisfy the free/open-source requirement and current React build? | Frontend + Security / license owner | Icon artifact installation/distribution |

## ADR format and review

Each new ADR includes ID, date, status, owner, context, requirements, considered alternatives, decision, consequences, risk/mitigation, migration/rollback, validation evidence, and superseded/revisit links. Version-sensitive dependency/provider choices are recorded with exact verified versions at implementation time.

Business policy changes require HR/Finance ownership; code architecture changes require Engineering; privacy/security changes require the relevant owner. Update affected PRD/API/data/testing documents with the decision. Do not quietly resolve open questions by copying illustrative greytHR values or website text.

## FE1 implementation decisions — 2026-09-28

- ADR-021: User explicitly selects Next.js, TanStack Query, Sonner, Framer Motion, Boneyard and Google Sans. These supersede the earlier React-only state/system-font/CSS-only motion defaults. Server pages remain the read orchestrators; stateful features observe hydrated query data rather than fetching in sections/UI.
- ADR-022: Use the MIT-labelled Iconsax React artifact for the explicitly requested local synthetic FE1 implementation; retain upstream notice and tarball integrity. Independent historical artwork provenance remains a distribution gate. No premium collection is downloaded or represented as OSS.
- ADR-023: FE1 is a foundation/component preview, not the operational role dashboard or Core HR completion. FE2–FE7 are tracked under the root completion folder independently from full-system P0–P6.
