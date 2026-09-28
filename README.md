# GTF HR · FE1 foundation

Next.js App Router frontend for GTF Technologies. FE1 is a working foundation preview with **synthetic data only**. It is not a live employee portal.

## Run locally

Use Node 22.20.0 and pnpm 10.33.2.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. `/loading-preview` demonstrates the generated Boneyard skeleton. Nothing connects to production HR or persists employee data.

## Stack

- Next.js 16 App Router, React, strict TypeScript, Tailwind CSS 4.
- Self-hosted Google Sans; logo-derived light/dark/system tokens.
- Iconsax via a typed, statically imported adapter.
- TanStack Query: per-request server cache hydration and a browser-memory data cache.
- Sonner: supplemental notifications alongside durable inline feedback.
- Framer Motion: lazy-loaded features, restrained dialog transitions, reduced-motion support.
- Radix Dialog: controlled open state, focus trap and keyboard behavior.
- Boneyard: skeleton geometry generated from the rendered page at eight widths.
- Zod: DTO validation at the mock API boundary.

Exact versions are in `package.json`; integrity hashes are in `pnpm-lock.yaml`.

## Architecture

```text
app/                    Server pages, root layout, loading/error boundaries
components/sections/    Layout and composition; resolved props only
components/ui/          Presentational primitives and controlled library adapters
components/features/    Small client interaction controllers and providers
lib/api/                Server-only read facades and runtime DTO validation
lib/mocks/              Deterministic, fictional fixtures; server-only
lib/state/              Query client configuration and scoped keys
lib/bones/              Generated responsive skeleton data
lib/motion/             Lazy Framer Motion features
lib/utils/              Pure helpers
types/                  Shared schemas and inferred DTO types
tests/                  Browser interaction/accessibility checks
completion/             Phase status, remaining work, evidence
system/brain/           Product and engineering specifications
```

Read flow: mock source → `lib/api` → server page → section → UI. The page hydrates the allowed fixture DTO into TanStack Query. The table controller observes that cache with `skipToken`, so it makes no browser API request and does not duplicate the server read. Four sample rows can be locally filtered; live HR lists will use scoped page-owned server search and pagination.

The theme cookie is the only persisted preference. No employee state, auth credentials, or query-cache persistence is placed in localStorage. There is no authentication yet; role screens and identity belong to FE2 and subsequent integration.

## Verification

```sh
pnpm check
# With the local server running:
pnpm test:e2e
pnpm skeletons:generate
```

Regenerate bones after layout, typography, or breakpoint changes. The generator is a local build tool and must only crawl synthetic pages. Commit the generated JSON and registry, then build again. Boneyard CLI capture can emit a development hydration warning because it enables its client-only capture mode; normal runtime hydration is checked independently.

For production preview: `pnpm build`, then `pnpm start`. Keep preview bound to localhost until authentication and release controls are implemented. Lighthouse and accessibility results are local evidence, not guarantees for a deployed HR workload.

See [FE1 status](completion/FE1.md), [frontend phase plan](completion/README.md), and [asset notices](completion/dependencies-and-assets.md).

The sidebar toggle collapses desktop navigation into a 64px icon rail with Framer Motion. On mobile it hides the horizontal navigation. Reduced motion is respected; the state is local to the page. Run `pnpm test:performance` against `pnpm start` to repeat the local mobile Lighthouse measurement.
