# Technology stack and installation plan

Status: FE1 frontend installed; backend and operations remain planned · Owner: Engineering Lead · Updated: 2026-09-28

## Baseline

Use **Next.js + React + TypeScript + Tailwind CSS + Radix + Iconsax** for the interface; **Node.js + PostgreSQL + Drizzle + Zod + pg-boss + decimal.js** for domain services; and self-hosted **Keycloak** for identity. Web and backend domains share one modular TypeScript application, with a separately runnable worker. A separate Express/Nest server is not required initially.

Required software must be free/open source and self-hostable without subscriptions, paid APIs or expiring trials. Iconsax is specifically requested: its package and artwork provenance require the distinct verification recorded in [free resources](free-resources.md); do not claim that every current Iconsax asset is open source. No paid icon collection is required. All other packages also need release-specific license/security checks.

This document names the system-wide plan. The FE1 frontend subset is now installed; exact installed versions are in the root package.json and pnpm-lock.yaml, with evidence under completion/. [Phases](phases.md) has **7 phases, P0–P6**. [Frontend/backend alignment](frontend-backend-alignment.md), [reusable components](reusable-components.md), and [state management](state-management.md) define how the stack is used.

## Frontend packages

| Dependency | Purpose | Boundary / installation stage |
| --- | --- | --- |
| `next`, `react`, `react-dom` | App Router, server rendering, Suspense, actions, metadata | P1; pages always server-only |
| `typescript`, `@types/react`, `@types/react-dom`, `@types/node` | Strict compile-time types | P1 development tools; strict mode and no `any` |
| `tailwindcss`, `@tailwindcss/postcss`, `postcss` | CSS utilities mapped to semantic theme variables | P1 build tools; pinned compatible Tailwind setup |
| Selected `@radix-ui/react-*` packages | Accessible dialogs, menus, tabs, select where needed | P1; install only primitives actually used |
| `iconsax-reactjs` | Required Iconsax React icon family | P1 candidate from the currently documented repository; exact artifact/license/React compatibility gate |
| Native HTML forms + React action hooks | Form drafts, pending state, server action results | Built-in first; no mandatory form library |
| `@tanstack/react-query` | Server hydration, async-data cache and future mutation lifecycle | FE1 installed; no private persistent cache |
| `sonner` | Supplemental toast notifications | FE1 installed; inline errors retained |
| `framer-motion` | Restrained client transitions | FE1 installed; LazyMotion and reduced motion |
| `boneyard-js` | Generated responsive skeletons | FE1 installed; local synthetic capture only |
| Google Sans variable WOFF2 | Self-hosted typography through next/font/local | FE1 installed; SIL OFL notices retained |
| Native `Intl` | Display currency, dates and numbers | Formatting only; never payroll calculation |
| Native manifest/service worker | Installable PWA, public-assets-only cache | P4; no paid plugin or private offline cache |

Radix behavior belongs inside controlled UI/feature boundaries. Presentational wrappers receive props; application state and command submission belong in feature controllers. Icons use named/static imports via a small adapter, not a runtime import of the complete icon catalog. See [reusable components](reusable-components.md) for the icon contract.

TanStack Query, Sonner, Framer Motion and Boneyard are explicitly selected by the user and implemented in FE1. No Redux, Zustand, SWR, React Hook Form, charting suite or premium component kit is installed. Add a dependency only for an actual requirement, with license, bundle and architecture review. Use semantic HTML/SVG and accessible tables for initial reporting.

## Backend packages and services

| Dependency / service | Purpose | Boundary / installation stage |
| --- | --- | --- |
| Supported Node.js LTS | Web/API server and independent worker runtime | P1; same tested major in local/CI/prod |
| `zod` | Runtime parsing of external input and contract DTOs | P1; all untrusted input starts as `unknown` |
| `drizzle-orm`, `pg` | Typed PostgreSQL repositories and transactions | P1; server-only, no automatic client access |
| `drizzle-kit`, `@types/pg` | Reviewed migrations and driver types | Development/migration tooling |
| PostgreSQL community | Canonical relational data, RLS, constraints and exact numeric storage | P1; separate migration/runtime identities |
| `openid-client` + Keycloak community | OIDC/PKCE protocol and MFA/credential lifecycle | P1; server sessions and business authorization remain application responsibilities |
| `pg-boss` | Durable jobs and retries using PostgreSQL | P1; worker plus transactional-outbox dispatcher |
| `decimal.js` | Exact payroll math with explicit rounding | P3; serialize money as decimal strings |
| `pino` | Structured redacted server/job logs | P1; no HR payload logging |
| OpenTelemetry JS packages selected for the pinned runtime | Traces/metrics instrumentation | P1–P4; exclude personal data and control exporters |
| `resend` | Transactional invite, recovery and security emails | P2; verified sender domain and API key required |
| `playwright` | Worker-only HTML-to-PDF for approved payslip templates | P3; never send browser/PDF runtime to client |
| SeaweedFS OSS | Private S3-compatible objects | P1 document tasks; verify required OSS API features |
| ClamAV | Malware scanning/quarantine | P1; up-to-date signatures and failure-closed access |
| OpenBao | Self-hosted secrets and encryption-key operations | Before restricted production data; tested recovery/unseal and access policies |

PostgreSQL numeric values stay strings until explicitly converted to exact decimal types; never install a global numeric-to-float parser. Drizzle does not replace authorization, composite keys or RLS. Review generated SQL; do not use automatic schema push in production.

Domain changes, audit and outbox commit atomically. A dispatcher publishes jobs after commit; duplicate dispatch is possible and must be safe. Queue guarantees never remove business idempotency requirements. Node worker and web processes share domain code but deploy with separate credentials and resource limits.

`openid-client` is a protocol client, not a complete permission/session framework. Keycloak owns credentials/MFA. Application code owns revocable server sessions, membership mapping, scope checks and safe DTOs. Use central policy functions rather than trusting a client-side role library. [Roles and permissions](roles-permissions.md) defines the enforcement model.

PDF rendering runs in an isolated worker using an approved template, escaped data, bounded page/time limits and no arbitrary network/local-file access. CSV exports stream with formula-injection protection. No external paid PDF service is required.

## Free self-hosted operations

| Responsibility | Selected OSS direction | Operational requirement |
| --- | --- | --- |
| OS and containers | Supported Linux + Podman | Security updates, non-root execution, resource limits and immutable image digests |
| HTTPS/proxy | Caddy | Certificate/trust configuration, renewal, correct origins, no private caching |
| Repository/CI | Forgejo + Forgejo Runner | Private repositories, isolated test/deploy identities and required checks |
| Database backup | pgBackRest | WAL archiving/PITR and tested restore |
| Object/config backup | restic | Encrypted separate-failure-domain backups coordinated with object metadata |
| Metrics/alerts | Prometheus + Alertmanager | Protected endpoints, low-cardinality labels and tested escalation |
| Dashboard | Grafana OSS | No required Enterprise plugin or hosted subscription |
| Mail server, conditional | Postal OSS | Only if company SMTP is unsuitable and a mail operator can support DNS/egress/reputation |

Use OSS editions only. SeaweedFS Enterprise features, Grafana Enterprise plugins and managed KMS/cloud services are not prerequisites. S3 compatibility does not guarantee object locks, all versioning semantics or key integration; test required features in the pinned build. If WORM is unavailable, use independently controlled signed-digest archives/offline backups and do not claim WORM compliance.

OpenBao is self-hosted key management, not a managed HSM. Its bootstrap, keys, recovery and availability must be independent enough to meet the threat/recovery model. Backups on the same failed host are not a recovery plan.

## Testing and developer tools

Use pnpm, TypeScript compiler, ESLint, Prettier, Vitest, Playwright, axe-core, Lighthouse CI and k6 OSS. Use Gitleaks for secret scanning, Trivy for relevant dependency/container findings, and Syft for an SBOM, after checking selected release licenses. Testing tools execute locally or on self-hosted runners; no cloud-testing account is required. See [testing](testing.md) and [CI/CD](github-action.md).

Use synthetic fixtures and real PostgreSQL for locking/RLS tests. A SQLite substitute cannot validate PostgreSQL concurrency guarantees. Browser automation can verify web flows; it does not certify payroll correctness or native-device behavior.

## Installation sequence and version rules

1. Inventory development/production/CI capacity, separate backup location, network/domain access, supported OS and operators. No subscriptions are created automatically.
2. Select supported stable versions as a compatible set. Record package version, source, license, integrity hash, security status, owner and reason. Commit runtime and package-manager pins plus one pnpm lockfile.
3. Scaffold Next.js/TypeScript and add frontend build/test tools. Install exact reviewed versions using `pnpm add --save-exact` for application packages and `pnpm add -D --save-exact` for development packages. Resolve explicit versions first; do not run unpinned bulk `latest` commands in CI.
4. Validate the exact Iconsax package and asset notices, exported symbols, type declarations, React peer support, server rendering and tree-shaking. Keep Iconsax as the required family; do not silently substitute another library.
5. Start disposable PostgreSQL/Keycloak for synthetic development. Add Zod, Drizzle/pg and `openid-client`, then implement one fully authorized page-to-domain path.
6. Add `pg-boss`/audit/outbox and worker. Add storage/ClamAV/OpenBao as corresponding tasks begin; give services separate credentials.
7. Add leave/attendance domains; introduce decimal.js and isolated PDF runtime only when payroll work starts. Do not load payroll/report dependencies into client bundles.
8. Configure Forgejo required checks with `pnpm install --frozen-lockfile`. Scan lockfile/images and archive SBOM/notices. Validate supported Forgejo action syntax rather than assuming complete GitHub parity.
9. Produce separate web/worker OCI artifacts, Caddy config, migration runner, secrets, telemetry and backup/restore procedures. Provision only approved company infrastructure.
10. Run release tests, license/asset checks, payroll shadow cycles, restore/rollback and staged pilot. Record results before calling anything production-ready.

The frontend installation has been executed for FE1; the root lockfile and completion/dependencies-and-assets.md record the selected artifacts and limitations. Backend installation steps remain future work.

## Later platforms and cost boundaries

P5 reuses the core stack. P6 native candidate is React Native + TypeScript; native Iconsax needs its own adapter/artifact review. Platform SDKs and stores have separate terms and possible costs. The responsive web/PWA is the required path without mandatory store accounts.

AI is optional and disabled. Any local runtime/model/tokenizer must have separately reviewed licenses and suitable company hardware. Open weights does not automatically mean open source. No paid AI API is required.

Software-license fees can be zero while servers, electricity, internet, backup disks, domains, mail operations and staff time cost money. Existing infrastructure has not been verified. Do not promise free hosting, free delivery at unlimited volume, or free public mobile distribution. Account recovery and critical alerts still need a reliable delivery/support path.

No required dependency on hosted Auth0/Clerk, Vercel, managed PostgreSQL subscriptions, paid UI templates, AdMob, SMS/WhatsApp, commercial map APIs or GitHub billing plans. GitHub-hosted upstream source links do not make GitHub a runtime or CI dependency.
