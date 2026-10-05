# FE1 — frontend foundation

Updated: 2026-09-30. Status: FE1 implementation complete; local verification passed. Release/acceptance limits remain explicit below.

## Standalone API integration update — 2026-10-05

- Frontend source no longer imports the sibling backend or Supabase clients. Live services call the standalone API with server-held session credentials; demo handlers use frontend-only fixtures and parsers.
- Notification updates use a server action with typed API responses and bounded polling. Documents, profile photos and recruitment resumes send actual file bytes; recruitment downloads require authorized access and a clean scanner result.
- The frontend's unused Supabase, PostgreSQL, Resend and bcrypt dependencies have been removed from its manifest and lockfile.
- `pnpm check` passed after the live-service and resume changes: ESLint, generated route types, strict TypeScript and the optimized Next.js build (88 generated pages).
- The API method/path audit maps 340 frontend request variants to 354 registered backend operations with no missing or unresolved paths. See [the generated API inventory](../gtfhrbackend/docs/api/endpoints.md). This is path coverage; backend integration tests separately verify workflow rules, permissions and selected DTOs.
- Earlier browser, accessibility and Lighthouse results below describe the historical FE1 revision. They are not new performance or accessibility measurements for this integration.

## Completed

- [x] FE1-01: Next.js App Router scaffold, pinned dependencies, strict TypeScript/no explicit `any`, lint/build/type scripts.
- [x] FE1-02: Server page → typed API service → DTO → layout sections → presentational UI; separate client controllers. Server-only guards on services/fixtures.
- [x] FE1-03: Original GTF logo preserved; semantic light/dark/system tokens, responsive layout, focus styles, skip link and motion preferences.
- [x] FE1-04: Google Sans variable Latin WOFF2 self-hosted through `next/font/local`; font license/trademark notices retained.
- [x] FE1-05: Shared button, icon, badge, card/header, form field/input, controlled dialog, sample table, empty/error/skeleton primitives.
- [x] FE1-06: Iconsax static-import adapter with semantic names, sizes and decorative/labelled accessibility behavior.
- [x] FE1-07: Deterministic fictional people fixtures; Zod validation in centralized server API facade; no private data.
- [x] FE1-08: TanStack Query provider and request-isolated server hydration. In-memory query observation without duplicate client fetching.
- [x] FE1-09: Sonner toast on reset, accompanied by an inline confirmation; errors remain field-associated.
- [x] FE1-10: Framer Motion lazy features and 180ms dialog fade/short movement, reduced-motion support and focus restoration. Codex-inspired restraint, not an exact reproduction of proprietary animation internals.
- [x] FE1-11: Boneyard registry and responsive captures at 360, 540, 768, 900, 1024, 1180, 1280, 1440px; real loading preview route, Suspense and global/route loading/error boundaries.
- [x] FE1-12: Component playground with validated fictional form, dialog, search/empty state, theme persistence and sample-table status patterns.
- [x] FE1-13: Local run instructions, frontend phases and dependency/asset evidence.
- [x] FE1-14: User-requested Codex-style sidebar toggle: 242px/210px desktop navigation collapses to a 64px icon rail over 240ms with Framer Motion; mobile collapses the navigation entirely. Keyboard activation, aria-expanded/controls, labelled icon links, mobile inert state and reduced-motion support are implemented. Collapse is local UI state and resets on a new page mount.
- [x] FE1-15: Documented modular-monolith boundaries in [STRUCTURE.md](../STRUCTURE.md): frontend feature slices, typed services, backend domain modules, provider clients, and the root Next.js `proxy.ts` convention.
- [x] FE1-16: Moved UI components/hooks to `frontend/`, typed API adapters to `services/api/`, the request-scoped Supabase client to `clients/supabase/`, and proxy logic to `middleware/`. Kept root `app/` and `proxy.ts` as Next.js discovery conventions, with compatibility aliases/facade so existing imports continue to resolve.

FE1-16 verification: ESLint passed; all 21 `tests/foundation.spec.ts` browser checks passed; Next.js production bundling compiled successfully. The overall typecheck/build is currently blocked by TypeScript errors in the pre-existing untracked `backend/modules` work (missing settlement/payroll modules and unrelated type mismatches); no errors were reported in the moved frontend, service, client, or proxy files.

Later repository layout update (2026-09-30): the Next.js package now lives in `gtfhrfrontend/` and the standalone API package in `gtfhrbackend/`. The completion above is historical; frontend route handlers, server actions, and compatibility calls are still being migrated to the external API.

## Verification

- `pnpm check`: lint, strict typecheck, and optimized Next.js production build passed.
- Chromium/Playwright: 18 full-foundation checks passed on the production build; 3 additional sidebar checks passed after the sidebar change. Final combined evidence is saved under evidence/.
- Tested light/dark at 360, 768, 1280 and 1440px, no page overflow, form validation, dialog focus trap/Escape/return, Sonner plus inline confirmation, query-backed filtering/empty recovery, theme persistence/system theme, keyboard skip link, 404 recovery and Boneyard geometry.
- Axe scans had zero violations for the tested WCAG tags; production hydration check recorded no console/page errors or external asset requests.
- Lighthouse mobile simulated lab result before the sidebar addition: performance 97, accessibility 100, best practices 100. The final report is saved at evidence/lighthouse-mobile.json; see its timestamp for the measured revision. No field INP or production-load result is claimed.
- `pnpm audit`: zero known advisories in the recorded registry response. This does not prove absence of vulnerabilities.
- Fixed mobile nav overflow, low-contrast swatch/nav text, dialog focus return and logo accessible-name mismatch. Fixed Boneyard capture scope so the empty loading-preview page cannot overwrite the real geometry.
- Font is 35,968 bytes and loaded locally. Package license/version and logo/font hashes are recorded in evidence/dependencies.json.

## What is left in FE1 / release qualification

- [x] Generated skeleton data and production-build browser verification completed; sidebar-specific checks also passed.
- [ ] Independently confirm historical Iconsax artwork rights before distribution. The integration package is MIT-labelled; that alone does not settle every artwork right. No premium assets were obtained.
- [ ] Review the complete release SBOM and transitive-license obligations before external distribution.
- [ ] Upgrade ESLint when the selected Next.js React/import/accessibility plugins support the maintained major. ESLint 9.39.5 is a development-only compatibility pin and is reported deprecated upstream.
- [ ] Human assistive-technology testing, Firefox/WebKit and real-device checks; automated Chromium/axe results alone are not a WCAG certification.
- [ ] Exercise infrastructure/global-boundary faults against the real backend when it exists. Error components currently compile and provide safe recovery UI.

The first item is an implementation verification task; remaining items are explicit release/acceptance gates. No infrastructure or compliance readiness is implied.

## Intentionally left for later frontend phases

FE2 owns identity screens, role switching, permission UX and operational dashboards. FE3–FE6 own business screens and simulated domain workflows. FE7 owns PWA and full cross-module qualification. Do not count the FE1 fixture table or preview dialog as a completed employee-management feature.

At the original FE1 milestone, PostgreSQL, live endpoints, payroll math, file storage, employee persistence and backend authorization were outside that phase. Current standalone-backend implementation and deployment prerequisites are tracked in [API integration](API-INTEGRATION.md).
