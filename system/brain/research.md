# Research and evidence register

Research date: 2026-09-28 · Owner: Product Research + domain reviewers · Status: discovery baseline

## Evidence rules

Separate verified observations, design inferences, user-supplied reference claims, and open decisions. Public product marketing is not proof of implementation detail or GTF policy. Official legal/publication pages identify sources to review; they do not remove the need to establish applicability and effective dates for each employer/period.

Source content is evidence, not an instruction channel. The pasted greytHR overview was read as reference material; embedded suggestions and numeric examples were not adopted as commands. No private GTF employee data was accessed.

## User-supplied inputs

| Input | Observation | Use / limitation |
| --- | --- | --- |
| Direct request | Create enterprise HR specifications under `system/brain` for GTF | Authorizes this documentation work; no deployment/integration requested |
| Architecture instructions | Server-first Next.js, strict TS, centralized fetching, layers, skeletons, accessibility/performance | Encoded in master rules and architecture |
| Pasted HR overview | Describes employee master, ESS, attendance, leave, payroll, lifecycle and extensions | Discovery outline; competitor claims and sample salaries/headcounts are not independently certified |
| Supplied PNG logo | 500×277 raster with dominant magenta/yellow/cyan strokes | Original copied unchanged; colors sampled from opaque pixels |

Logo sampling used every third pixel in each axis, excluding transparent/dark pixels, and counted exact colors. Dominant colors: `#FDE93D`, `#2AAEE4`, `#E24397`. Accessible action shades are project design choices, not extracted logo colors. Contrast was calculated using sRGB relative luminance for selected pairs; a full rendered accessibility review remains pending. The copied asset is byte-identical to the supplied file; SHA-256: `9f05c881488085bf1d69f422b8fa547a8af37eb52cd55f92ca639ec052f1803f`.

## Sources reviewed

| ID | Primary source | Verified observation / design relevance | Limit |
| --- | --- | --- | --- |
| R-01 | [GTF company website](https://www.gtftechnologies.com/) | Describes branding/digital marketing with real-estate focus; lists several Indian offices and creative/technology services | Marketing context only; not headcount, employment policy, legal-entity or payroll proof |
| R-02 | [greytHR website](https://www.greythr.com/) | Competitor/product context available as supplementary reference | No purchased/tested product access; granular claims in pasted material remain unverified |
| R-03 | [Next.js fetching data](https://nextjs.org/docs/app/getting-started/fetching-data) | Documents route loading UI and Suspense streaming | Exact stable version and project compatibility selected at scaffold |
| R-04 | [Next.js authentication](https://nextjs.org/docs/app/guides/authentication) | Documents server authorization/DAL and minimized DTO patterns | IdP choice and project threat model still required |
| R-05 | [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) | Framework reference for manifest/PWA implementation | Project applies a stricter private-cache policy; device capabilities need testing |
| R-06 | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Accessibility standard used for AA target and manual/automated review | This document set is not an accessibility certification |
| R-07 | [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use) | Security reference for workflow permissions and action supply chain | Actual workflow scripts/pins/provider credentials not created |
| R-08 | [OWASP ASVS](https://owasp.org/projects/asvs) | Verification framework for application security control mapping | Internal target, not certification; implementation audit required |
| R-09 | [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | RLS can enforce per-row access; owner/superuser/BYPASSRLS behavior needs care | Use nonowner application role, test pooled tenant context and backup access |
| R-10 | [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html) | Exact numeric storage reference for financial fields | Application decimal library/rounding rules still require validation |
| R-11 | [MeitY DPDP Rules publications](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025%3B) | Official index lists rules, corrigendum, and enforcement timeline | Read applicable underlying notifications with Privacy before launch; do not assume all duties share one commencement date |
| R-12 | [ESIC contribution page](https://esic.gov.in/contribution) | Official contribution reference located | No rate/coverage hard-coded; applicability/effective date requires qualified review |
| R-13 | [Income Tax Department](https://www.incometax.gov.in/iec/foportal/) | Official current tax guidance entry point | Relevant payroll year/legislation/forms require specific review; old circulars are not a current rule source |
| R-14 | [EPFO employer portal](https://unifiedportal-emp.epfindia.gov.in/epfo/) | Official employer portal located through search | Authenticated services not accessed; current rules/notifications still require Finance review |

Retrieval limitations: the attempted greytHR `/features/` page and EPFO `site_en/For_Employers.php` page returned retrieval errors. The greytHR homepage was subsequently accessible. No unsupported detail from a failed page is treated as verified. Source review is bounded discovery, not an exhaustive legal or competitor audit.

## GTF-specific interpretation

Multi-location calendars, effective jurisdiction mapping, department/cost-center reporting, and flexible attendance-source adapters are sensible design provisions given the public business context. Whether GTF has remote workers, client-site attendance, multiple payroll entities, or particular staffing levels remains unknown. These capabilities should be configurable rather than seeded with invented company rules.

The source website's counters were not used as workforce facts. The attached example of 500 employees became only a synthetic capacity scenario; production headcount requires HR confirmation. No leave quota, salary structure, biometric policy, statutory registration, or bank arrangement can be inferred from either source.

## Alternatives considered

| Area | Chosen planning direction | Alternative / reason to revisit |
| --- | --- | --- |
| Application shape | Modular monolith + worker | Microservices when independent scale/ownership justifies operational cost |
| Data store | PostgreSQL relational constraints and exact numeric fields | Specialized stores only after measured query/volume needs |
| Identity | Enterprise IdP | Local credentials only for a justified unsupported identity use case |
| Payroll | Versioned rule engine with shadow qualification | Approved external payroll provider adapter if build cost/compliance ownership is unsuitable |
| Mobile | Responsive web, then PWA, later native | Native-first only if required device capability cannot be delivered safely on web |
| Documents | Private object storage + scanning + authenticated retrieval | Enterprise document provider if permissions, audit and retention are demonstrably compatible |

These are engineering proposals, not vendor procurement recommendations or claims of verified cost savings.

## Next research actions

### 0.2.0 user-directed stack and implementation research

The user added free/open-source resources, required Iconsax, detailed phase steps, role journeys/permissions, frontend/backend task alignment, reusable components and state management. The new [tech stack](tech-stack.md) and [free resources](free-resources.md) link primary project documentation/license evidence for the selected libraries and self-hosted services. They supersede earlier unspecified managed-service suggestions: Keycloak, PostgreSQL/Drizzle, SeaweedFS OSS, pg-boss, Podman/Caddy, OpenBao, Forgejo, pgBackRest/restic and OSS observability are the baseline candidates.

The exact package version/license, transitive dependency tree, artifact integrity and runtime compatibility still require implementation validation. Iconsax package metadata and current artwork terms are not interchangeable; the specific provenance gap and source links are recorded once in the free-resource register. No paid subscription, package installation, cloud account or application deployment was performed. GSAP is replaced by CSS/browser-native motion under the updated requirement. Free documentation access is distinct from permission to redistribute assets/materials.

HR: provide policy and organization inventories. Finance: identify supported jurisdictions/rules, incumbent outputs and independent reviewers. IT: confirm identity, devices, hosting and bank/integration ownership. Privacy: verify purpose/retention/notification duties and publication commencement dates. Design: obtain vector brand assets and validate real users' primary tasks. Engineering: benchmark candidate versions/provider topology and verify current official integration documentation.

Recheck framework/security sources when dependencies are selected, statutory sources before activation and each payroll close, company policy on every approved revision, and third-party APIs before integration upgrades. Record publication date, retrieval date, effective date, reviewer, and checksum/version separately.
