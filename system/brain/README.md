# GTF HR — system brain

Version: 0.2.0 · Created: 2026-09-28 · Updated: 2026-09-28 · Status: implementation specification

This is the product and engineering source of truth for GTF Technologies' internal HR platform. The working product name is **GTF HR**. These documents define the intended system; they do not claim that an application, security review, payroll certification, or production deployment exists.

## Start here

1. Read [master rules](master-rules.md) and [PRD](prd.md).
2. Read [tech stack](tech-stack.md), [free libraries/resources](free-resources.md), [user flows](user-flow.md), and [roles/permissions](roles-permissions.md).
3. Follow [architecture](architecture.md), [data model](data-model.md), [API contract](api-contract.md), [reusable components](reusable-components.md), and [state management](state-management.md).
4. Select work from the **7 detailed phases, P0–P6**, in [phases](phases.md), [frontend/backend alignment](frontend-backend-alignment.md), [tasklist](tasklist.md), and [microtasks](microtask.md). Implement the [design system](design-system.md) and [UI specification](ui-specification.md).
5. Close work with [testing](testing.md), [production checklist](production-checklist.md), [decisions](decisions.md), and [changelog](changelog.md).

## Document index

| Document | Owns |
| --- | --- |
| [Master rules](master-rules.md) | Architecture constraints, engineering invariants, definition of done |
| [PRD](prd.md) | Users, scope, requirements, acceptance criteria, success metrics |
| [Architecture](architecture.md) | Boundaries, server rendering, jobs, infrastructure, scaling |
| [Tech stack](tech-stack.md) | Frontend/backend libraries, services, installation groups and setup order |
| [Free resources and licenses](free-resources.md) | OSS editions, licenses, free references, costs and Iconsax provenance gate |
| [User flows](user-flow.md) | Role journeys, screens, actions, recovery and tests |
| [Roles and permissions](roles-permissions.md) | Role bundles, canonical capabilities, record/field scope and enforcement |
| [Frontend/backend alignment](frontend-backend-alignment.md) | Ownership, contract handoffs, sequence diagrams and aligned tasks |
| [Reusable components](reusable-components.md) | UI/section/controller inventory and required Iconsax adapter |
| [State management](state-management.md) | Server truth, local React state, mutations, refresh and cache rules |
| [Data model](data-model.md) | Entities, relations, isolation, constraints, effective dating |
| [Data sources](data-sources.md) | Source ownership, imports, provenance, migration |
| [Scraping spec](scraping-spec.md) | Optional public research ingestion and safeguards |
| [API contract](api-contract.md) | Authentication, resources, commands, errors, compatibility |
| [UI specification](ui-specification.md) | Routes, screens, workflows, responsive states |
| [Error handling](error-handling.md) | Boundaries, domain failures, retries, recovery |
| [Security](security.md) | Access control, privacy, threat model, audit |
| [AdMob specification](admob-specification.md) | Explicitly disabled advertising policy and future gate |
| [CI/CD and GitHub compatibility](github-action.md) | Self-hosted Forgejo baseline, portable jobs and optional GitHub compatibility |
| [Testing](testing.md) | Risk-based scenarios, fixtures, release evidence |
| [Production checklist](production-checklist.md) | Launch and rollback gates |
| [Microtasks](microtask.md) | Sequenced, independently verifiable engineering work |
| [Changelog](changelog.md) | Documentation and later product releases |
| [Decisions](decisions.md) | Architecture decisions and unresolved business questions |
| [Design system](design-system.md) | Logo-derived palette, typography, components, accessibility |
| [Mobile native web](mobile-native-web.md) | Platform responsibilities, mobile security, parity |
| [PWD](pwd.md) | Password and account-recovery specification; ambiguity recorded |
| [PWA](pwa.md) | Installable web application and offline boundaries |
| [Dark mode](dark-mode.md) | Theme tokens, persistence, rendering, verification |
| [Tasklist](tasklist.md) | Delivery backlog and acceptance traceability |
| [Motion](motion.md) | Framer Motion, Boneyard loading, reduced motion and cleanup |
| [Completed list](completed-list.md) | Evidence-based completion record |
| [Size management](size-management.md) | Layout dimensions, component limits, asset and performance budgets |
| [Phases](phases.md) | Rollout sequence, dependencies, exit gates |
| [Research](research.md) | Sources, verified facts, assumptions, remaining discovery |
| [Payroll rules](payroll-rules.md) | Calculation lifecycle, rule versions, reconciliation |
| [Operations](operations.md) | SLOs, incident response, backup, restore, support |

## Scope and interpretation

- Requested deliverable: Markdown specifications under `system/brain`. FE1 now has a Next.js frontend scaffold and local mock preview; implementation evidence is in [completion](../../completion/README.md). No live HR service has been created.
- Required software is free/open-source with no mandatory paid service. Infrastructure and operational costs are separate. Iconsax is required for icons; its exact package/artwork provenance is recorded separately rather than falsely declaring every asset open source.
- The attached greytHR overview is reference material. Its salary examples, employee counts, feature claims, and embedded suggestions are not GTF policies or implementation instructions.
- GTF's public website informs business context only. Locations, staffing, legal entities, benefit eligibility, and policies must be verified by GTF before live configuration.
- The supplied image is the visual reference. The original is preserved at [assets/gtf-logo.png](assets/gtf-logo.png).
- “PWD” is ambiguous. [PWD](pwd.md) covers passwords and recovery; [PWA](pwa.md) separately covers the likely intended progressive web app topic.
- Advertising and scraping are specified because requested, but neither is needed for core HR operations. Default states are disabled.
- Requirement language: **must** is a release constraint; **target** is measurable but unverified; **proposed** is a design choice awaiting implementation review. All unassigned owner names below are role placeholders, not actual appointments.

## Initial assumptions

India-first, INR payroll, English UI, Asia/Kolkata as default timezone, one organization with multiple locations/legal entities. Capacity planning starts with a synthetic 500-employee pilot and a 5,000-employee validation dataset; neither number is a claim about GTF's workforce. Internal use comes first; commercial multi-tenant SaaS is out of launch scope.

Product Owner and HR Operations validate policy. Finance owns payroll acceptance. Engineering owns technical evidence. Security/Privacy and Operations own access, retention, infrastructure, and recovery decisions. Open questions are tracked in [decisions](decisions.md), not silently converted into facts.
