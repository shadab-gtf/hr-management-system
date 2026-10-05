# Free libraries, resources, and licenses

Status: planning register; release-specific license audit pending · Owner: Engineering + Security · Updated: 2026-09-28

Required software must be free/open source and self-hostable without mandatory subscriptions or paid APIs. Source visibility, a free tier and open-source licensing are different. The library list is in [tech stack](tech-stack.md). This register records upstream licenses; installation must inspect pinned artifacts, bundled notices, dependencies and asset provenance.

## Application register

| Project | Core license / status | Primary reference |
| --- | --- | --- |
| Next.js | MIT | [License](https://raw.githubusercontent.com/vercel/next.js/canary/license.md) |
| React | MIT | [License](https://raw.githubusercontent.com/facebook/react/main/LICENSE) |
| TypeScript | Apache-2.0 | [License](https://raw.githubusercontent.com/microsoft/TypeScript/main/LICENSE.txt) |
| Node.js | MIT plus bundled third-party notices | [License](https://github.com/nodejs/node/blob/main/LICENSE), [support schedule](https://nodejs.org/en/about/previous-releases) |
| pnpm | MIT | [License](https://github.com/pnpm/pnpm/blob/main/LICENSE) |
| Tailwind CSS | MIT; excludes premium template products | [License](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/LICENSE) |
| Radix Primitives | MIT | [License](https://raw.githubusercontent.com/radix-ui/primitives/main/LICENSE) |
| Iconsax React integration | MIT-labeled package; underlying artwork provenance gate below | [Repository](https://github.com/rendinjast/iconsax-react), [package repository license](https://raw.githubusercontent.com/rendinjast/iconsax-react/master/LICENSE) |
| Zod | MIT | [License](https://raw.githubusercontent.com/colinhacks/zod/main/LICENSE) |
| Drizzle ORM/Kit repository | Apache-2.0; verify package artifacts | [License](https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/LICENSE) |
| node-postgres (`pg`) | MIT | [License](https://github.com/brianc/node-postgres/blob/master/LICENSE) |
| pg-boss | MIT | [License](https://raw.githubusercontent.com/timgit/pg-boss/master/LICENSE) |
| openid-client | MIT | [License](https://raw.githubusercontent.com/panva/openid-client/main/LICENSE.md) |
| decimal.js | MIT | [License](https://raw.githubusercontent.com/MikeMcl/decimal.js/master/LICENCE.md) |
| Resend Node.js SDK | MIT | [License](https://raw.githubusercontent.com/resend/resend-node/main/LICENSE) |
| Pino | MIT | [License](https://raw.githubusercontent.com/pinojs/pino/main/LICENSE) |
| OpenTelemetry JS | Apache-2.0; exporter/package checks required | [License](https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE) |
| Vitest | MIT | [License](https://raw.githubusercontent.com/vitest-dev/vitest/main/LICENSE) |
| Playwright | Apache-2.0; browser binaries have additional notices | [License](https://raw.githubusercontent.com/microsoft/playwright/main/LICENSE) |
| axe-core | MPL-2.0 | [License](https://raw.githubusercontent.com/dequelabs/axe-core/develop/LICENSE) |
| k6 OSS | AGPL-3.0 | [License](https://raw.githubusercontent.com/grafana/k6/master/LICENSE.md) |
| React Native, later phase | MIT; platform services separate | [License](https://raw.githubusercontent.com/facebook/react-native/main/LICENSE) |

Default-branch license references are research evidence, not instructions to install canary/beta builds. ESLint, Prettier, Lighthouse CI, Gitleaks, Trivy, Syft, test adapters and all transitive dependencies must enter the release SBOM with exact licenses at MT-003/MT-031; their mention here does not constitute a completed package audit.

## Iconsax requirement and precise license boundary

Iconsax remains the requested icon family. The `rendinjast/iconsax-react` repository currently documents `iconsax-reactjs` and an MIT license; the older `iconsax-react` npm listing also reports MIT. Current Iconsax artwork terms describe proprietary free/premium licenses. Package metadata alone therefore does not settle the rights to every included graphic. [Package repository](https://github.com/rendinjast/iconsax-react), [older npm listing](https://www.npmjs.com/package/iconsax-react?activeTab=dependencies), [current artwork terms](https://docs.iconsax.io/license-and-terms/license)

MT-005 must preserve the exact package tarball/hash, license/notices, source icon provenance and applicable historical terms, then verify React compatibility and bundle output. Do not download premium icons or assume current free artwork is OSI open source. If artifact rights cannot satisfy both requirements, retain Iconsax in the design specification and record the narrow unresolved license decision for the owner before installation/distribution. Do not silently change libraries, label proprietary assets MIT, or buy a subscription. Documentation and all independent implementation can proceed.

## Self-hosted services

| Project / edition | Core license | Primary reference |
| --- | --- | --- |
| PostgreSQL community | PostgreSQL License | [License](https://www.postgresql.org/about/licence/) |
| Keycloak community | Apache-2.0 | [Project](https://github.com/keycloak/keycloak) |
| SeaweedFS OSS | Apache-2.0; enterprise features excluded | [Project](https://github.com/seaweedfs/seaweedfs) |
| ClamAV | GPL-2.0 core; bundled notices apply | [Project](https://github.com/Cisco-Talos/clamav) |
| OpenBao | MPL-2.0 | [License](https://raw.githubusercontent.com/openbao/openbao/main/LICENSE) |
| Podman | Apache-2.0 | [License](https://github.com/containers/podman/blob/main/LICENSE) |
| Caddy | Apache-2.0; optional modules separately reviewed | [License](https://github.com/caddyserver/caddy/blob/master/LICENSE) |
| Forgejo | GPL-3.0-or-later current project line | [Official license explanation](https://forgejo.org/2024-08-gpl/) |
| Forgejo Runner | GPL-3.0-or-later current project line; verify selected artifact | [Official administration guide](https://forgejo.org/docs/latest/admin/actions/) |
| pgBackRest | MIT | [License](https://raw.githubusercontent.com/pgbackrest/pgbackrest/main/LICENSE) |
| restic | BSD-2-Clause | [License](https://raw.githubusercontent.com/restic/restic/master/LICENSE) |
| Prometheus | Apache-2.0; Alertmanager release checked separately | [License](https://raw.githubusercontent.com/prometheus/prometheus/main/LICENSE) |
| Grafana OSS | AGPL-3.0; no Enterprise-only plugin required | [License](https://raw.githubusercontent.com/grafana/grafana/main/LICENSE) |
| Postal, conditional SMTP service | MIT; dependencies separately reviewed | [Project](https://github.com/postalserver/postal) |

These services run separately from the TypeScript application and need patch, backup and access ownership. Their licenses permit free software use subject to their terms; company infrastructure and operators still have costs. Confirm selected OSS storage/key/backup features rather than substituting paid enterprise capabilities.

## License and dependency workflow

1. Record name/version, upstream URL, SPDX expression, checksum, included NOTICE, dependencies, owner, intended use and modifications/distribution.
2. Preserve required licenses/attribution in release artifacts and third-party notices. GTF does not own third-party artwork or code simply by importing it.
3. Review MPL/GPL/AGPL obligations for actual modifications, distribution and network use. Copyleft is open source, not a paid-license category; neither universal disclosure of unrelated HR code nor universal exemption should be assumed.
4. Exclude unknown/noncommercial-only/source-available-only licenses, premium plugins and mandatory usage-metered APIs from the baseline. Keep the explicitly requested Iconsax case visible as described above.
5. Recheck licenses and vulnerabilities on upgrades. Keep secure supported versions or select an approved OSS replacement; do not retain vulnerable software indefinitely to avoid review.
6. Generate an SBOM and third-party notices from the actual release. Review browser/container/OS artifacts as well as npm packages. This document is not a legal opinion or release certification.

GSAP is excluded: its no-charge standard license has use restrictions, so it is not treated as meeting this project's FOSS baseline. CSS/Web Animations cover planned motion. [GSAP license](https://gsap.com/community/standard-license/)

## Free reference resources

| Topic | Resource | Use |
| --- | --- | --- |
| Web architecture | [Next.js docs](https://nextjs.org/docs/app) | Server rendering, fetching, security and deployment |
| React | [React Learn](https://react.dev/learn) | State ownership, forms and interactions |
| Types | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) | Narrowing, strict types and reusable contracts |
| Browser/CSS | [MDN](https://developer.mozilla.org/en-US/docs/Web) | Semantic HTML, CSS and browser APIs |
| Styling | [Tailwind docs](https://tailwindcss.com/docs) | Token-driven styling; no premium templates needed |
| Primitives | [Radix docs](https://www.radix-ui.com/primitives/docs/overview/introduction) | Focus/keyboard behavior |
| Database | [PostgreSQL docs](https://www.postgresql.org/docs/current/) | Constraints, transactions, RLS and exact numeric types |
| ORM | [Drizzle docs](https://orm.drizzle.team/docs/overview) | Typed SQL and reviewed migrations |
| Validation | [Zod docs](https://zod.dev/) | Runtime schema validation |
| Identity | [Keycloak docs](https://www.keycloak.org/documentation) | Identity, MFA and operations |
| Tests | [Playwright](https://playwright.dev/docs/intro), [Vitest](https://vitest.dev/guide/) | E2E and deterministic domain tests |
| CI | [Forgejo Actions](https://forgejo.org/docs/latest/user/actions/reference/) | Supported workflows and runner isolation |
| Security | [OWASP ASVS](https://owasp.org/projects/asvs) | Control/evidence mapping |
| Accessibility | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | AA acceptance criteria |

Free reading does not grant unlimited copying of documentation, images or trademarks. Use the supplied GTF logo, original layouts and the user-requested self-hosted Google Sans under its SIL OFL 1.1 license. No paid design-tool, course, stock-image or font subscription is needed for the required implementation.

## Costs that free software cannot remove

Company servers/VMs, power, connectivity, storage, independent backups, domain renewal, administration and security work are resources, not software license fees. SMTP delivery needs valid DNS, egress and reputation; no unlimited reliable free-email promise. Native SDK/store services have separate terms and potential fees; web/PWA is the required no-store-account delivery path. AI, SMS, WhatsApp, map APIs and paid device integrations are not required.

A proprietary hosting free tier or GitHub quota is not an enterprise capacity plan. Source links hosted on GitHub do not require a GTF GitHub subscription or public repository. Source retrieval errors were recorded during research; the installation gate must inspect actual release artifacts, especially Iconsax, the runner and bundled binaries, before declaring license clearance.

## FE1 user-selected additions

TanStack Query, Sonner, Framer Motion and Boneyard are installed MIT packages. Google Sans is self-hosted with OFL/trademark notices. See [exact implementation evidence](../../completion/dependencies-and-assets.md) for versions, source boundaries and the remaining Iconsax artwork review. The explicit FE1 request authorized installing the MIT-labelled Iconsax wrapper for this local synthetic preview; distribution clearance remains pending. The earlier pre-install planning gate is superseded for this local implementation only.
