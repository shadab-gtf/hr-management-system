# Master rules

Status: normative engineering baseline · Owner: Engineering Lead · Updated: 2026-09-28

## Product invariants

1. One immutable employee identity connects employment history, attendance, leave, payroll, documents, and self-service. Rehire creates a new employment record, not a duplicate person identity.
2. Every protected operation verifies identity, organization membership, permission, record scope, and field scope on the server.
3. Never infer salary, statutory eligibility, attendance penalties, leave quotas, or consent from example data or website content.
4. Approved financial outputs and closed periods are immutable. Corrections use linked adjustments and explicit approvals.
5. Financial commands, attendance ingestion, approvals, and background jobs must tolerate retries without duplicate effects.
6. No live payroll until Finance validates effective rules and two consecutive shadow payroll cycles reconcile against the incumbent process.

## Required separation

| Layer | Responsibility | Forbidden |
| --- | --- | --- |
| `app/**/page.tsx` | Server data orchestration, metadata, composition of sections and Suspense boundaries | `use client`, browser APIs, presentational markup, business calculations |
| `components/sections/` | Layout and composition from typed props | API/DB imports, independent data fetching, policy evaluation |
| `components/ui/` | Stateless presentational primitives with props/callbacks | Fetching, domain state ownership, authorization decisions |
| `components/features/` | Small client interaction controllers where necessary | Raw API requests, database access, business-rule duplication |
| `lib/api/` | Typed server-only read adapters and transport normalization | Client imports, persistence of shared private results |
| `lib/actions/` | Server mutation entrypoints with validation and authorization | Trusting browser identity/scope or bypassing domain services |
| `lib/server/` | Domain services, repositories, policy evaluation, transactions | Browser imports, UI dependencies |
| `types/` | Serializable DTOs, branded identifiers, domain interfaces | Runtime secrets or environment configuration |

Read path: **API/domain query → lib/api → Page → Section → UI**. Page-local async data helpers in the page file own all page reads and sit underneath explicit Suspense boundaries. Sections receive resolved data. See [architecture](architecture.md) for the streaming pattern.

Mutation path: feature form → server action supplied by route composition → validation/authorization → domain command → database transaction → targeted route refresh. A form submitting an action is not permission to fetch in the component. External/native requests use versioned API handlers that call the same services. “Only pages fetch” applies to web rendering; it does not prevent authorized API handlers, workers, or command services from accessing persistence.

## TypeScript and validation

- Strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and no explicit or implicit `any`.
- Untrusted input begins as `unknown`; validate at the boundary with a runtime schema. Never use a type assertion to bypass parsing.
- Keep database models separate from public DTOs. Select only approved fields before serialization into HTML, React payloads, API responses, exports, or notifications.
- Use decimal arithmetic for money and rates. Serialize money as fixed decimal strings plus ISO currency. Never compute payroll using binary floating point.
- Store timestamps in UTC, retain source timezone, and use date-only values for calendar dates. Store attendance minutes as integers and leave units as exact fractions.

## Rendering and performance

- Server Components by default. Client boundaries only for interaction, animation, and browser APIs; never in a page.
- Root and data-bearing routes require `loading.tsx` and `error.tsx`; root layout failures also require `global-error.tsx`.
- Each async region has a matching skeleton and Suspense boundary. A skeleton reserves the final geometry and includes an accessible loading message; no spinners or blank screens.
- Use `next/image` with explicit width/height and responsive `sizes`. Eager/priority loading only when justified for an actual above-fold LCP image; below-fold assets lazy load. Check the pinned framework's recommended priority/preload API at implementation time.
- No private shared caching. Per-request deduplication may reuse the same authorized read within a render, never across user sessions.
- Target Lighthouse performance ≥95 on the agreed route matrix. Target CLS 0 in controlled loading tests; investigate field regressions. [Size management](size-management.md) defines measurement and budgets.
- Dynamically load heavy editors/charts only where used. Use user-selected Framer Motion for controlled transitions, CSS for simple feedback, and Boneyard for skeletons, with cleanup and reduced-motion handling. GSAP is excluded from the current free/open-source baseline.

## Accessibility, SEO, and consistency

Semantic HTML, visible keyboard focus, labeled forms, meaningful alternative text, readable errors, and WCAG 2.2 AA validation are release requirements. All private routes use generic metadata and `noindex, nofollow`; authorization is the privacy boundary, not robots directives. Never place employee names or compensation in social previews or document titles.

Use shared tokens and primitives. Do not clone modules for employee and manager roles; share layouts while supplying independently authorized view models. Do not hide unreadable branded text behind “brand fidelity”; use approved accessible action shades.

## Change control and definition of done

The user's updated software constraint is mandatory: use free/open-source libraries and self-hostable service editions without required paid subscriptions, premium templates, trial dependencies or metered APIs. [Tech stack](tech-stack.md) and [free resources](free-resources.md) own selections/licenses; no hardware/hosting cost is promised to be zero. Iconsax is the required icon family and must pass the exact-artifact/artwork provenance check before installation/distribution; do not silently substitute icons or describe uncertain rights as cleared. [Reusable components](reusable-components.md), [state management](state-management.md), [roles and permissions](roles-permissions.md), and [frontend/backend alignment](frontend-backend-alignment.md) extend these boundaries.

Before implementing, link a requirement and microtask, identify the affected API/data contract, and check the above constraints. Before completion: typecheck, appropriate tests, build, authorization/negative cases, loading/error/empty states, responsive and accessibility review, measured performance where affected, and documented migrations/rollback where relevant. Record actual evidence in [completed list](completed-list.md). Failed constraints must be corrected before merging.

Do not mark proposed work complete because it is documented. Do not add packages, abstractions, microservices, tracking SDKs, or external data collection without a demonstrated requirement. Scope changes update PRD, decisions, tests, and rollout gates together.
