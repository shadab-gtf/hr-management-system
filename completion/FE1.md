# FE1 — frontend foundation

Updated: 2026-09-28. Status: FE1 implementation complete; local verification passed. Release/acceptance limits remain explicit below.

## Completed

- [x] FE1-01: Next.js App Router scaffold, pinned dependencies, strict TypeScript/no explicit `any`, lint/build/type scripts.
- [x] FE1-02: Server page → `lib/api` → typed DTO → layout sections → presentational UI; separate client controllers. Server-only guards on API/fixtures.
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

No PostgreSQL, Keycloak, live endpoints, payroll math, file upload/storage, employee persistence, external email, deployment, or production authorization has been implemented.
