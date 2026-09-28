# FE1 dependencies and asset provenance

Recorded: 2026-09-28. Exact installed versions and registry integrity hashes are in `../package.json` and `../pnpm-lock.yaml`.

## User-selected frontend libraries

| Library | Installed role | Upstream license |
| --- | --- | --- |
| Next.js / React | Server-first App Router and rendering | MIT |
| TanStack Query | SSR hydration and browser-memory async-data cache | MIT |
| Sonner | Supplemental toast feedback | MIT |
| Framer Motion | Lazy client motion with reduced-motion handling | MIT |
| Boneyard (`boneyard-js`) | Build-time layout capture and runtime skeletons | MIT |
| Iconsax (`iconsax-reactjs`) | Static imports through `AppIcon` | MIT-labelled integration; artwork boundary below |
| Radix Dialog | Accessible controlled dialog behavior | MIT |
| Zod | Runtime fixture/DTO validation | MIT |
| Tailwind CSS | CSS pipeline and semantic utility tokens | MIT |
| Google Sans | Local variable Latin font, weights 400–700 | SIL OFL 1.1 |

## Google Sans

Source: [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/googlesans), [Google Sans upstream](https://github.com/googlefonts/googlesans). Google Fonts CSS API supplied the version-70 Latin variable WOFF2: `https://fonts.gstatic.com/s/googlesans/v70/4UasrENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iqcsih3SAyH6cAwhX9RPjIUvQ.woff2`.

Retained unmodified at `app/fonts/google-sans-latin.woff2`. OFL and trademark notices are served from `public/licenses`. Only Latin is bundled in FE1; other scripts and currency glyphs may use the system fallback until locale subsets are explicitly added. No Google logo glyph or Google branding is used. No font request leaves the app at runtime.

## Iconsax

Installed `iconsax-reactjs@0.0.8` from its declared [repository](https://github.com/rendinjast/iconsax-react); peer metadata accepts React `*`, and actual compatibility is checked through the Next build/browser tests. Package declares `sideEffects: false`; only explicit named icons are used. The upstream MIT notice is retained at `public/licenses/iconsax-react-MIT.txt` because the tarball omitted a LICENSE file.

Registry integrity: `sha512-cb+uTMxbkSFNbu8ZclX7BWQVfOWQt8+m/PsDjnsm/H+mcYrnfTYMjHxiof1FB43k7UAgt1ds+0oFeMVKdqyslw==`.

This local synthetic implementation follows the user's explicit Iconsax requirement. It does not declare independent historical artwork clearance: the original artwork repository did not provide a root LICENSE in the inspected listing, and newer Iconsax artwork terms differ from the wrapper's MIT notice. Distribution remains gated on provenance review. No replacement family or premium download was used.

## Boneyard

Requested source: [0xGF/boneyard](https://github.com/0xGF/boneyard). Installed `boneyard-js@1.10.0`, using its React entry point. CLI uses Playwright locally to capture geometry, not employee text/data. Do not run capture against private production records. Keep generated `lib/bones` assets with the matching UI revision.

## Boundaries

No paid service, subscription or hosted font dependency was introduced. Software license fees differ from server/operations costs. `pnpm audit` and exact top-level license metadata are recorded separately in verification evidence; neither replaces complete transitive-license or release-security review.
