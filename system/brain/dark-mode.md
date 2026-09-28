# Dark mode

Status: required web design capability · Owner: Frontend Lead · Updated: 2026-09-28

## Preference model

Support `system`, `light`, and `dark`. Initial default is system. Store an explicit preference in a non-sensitive, bounded theme cookie so the server can render the correct `data-theme` on the document. Do not store employee data with preferences. A theme toggle is a small client feature controller; pages remain Server Components.

For system mode, use `prefers-color-scheme` CSS before first paint. For explicit mode, server-rendered attributes take precedence. The toggle updates cookie and current attribute without a full reload, then maintains server/client agreement. No arbitrary inline script is required for first-paint correction. If the chosen library needs one, integrate it with the approved CSP nonce and verify hydration; do not disable CSP or suppress all hydration warnings.

## Token application

[Design system](design-system.md) owns hex values. Implement semantic CSS custom properties for surface, text, border, action, status, and focus tokens. Components must consume semantic tokens rather than select colors with per-component theme conditionals. Original logo colors stay unchanged. The image receives a tested neutral mounting surface if contrast at its edges is unclear.

Dark mode uses lighter foregrounds and action fills, restrained shadows, and visible outlines. Error/success badges keep text labels and icons. Financial charts need alternate lines/patterns and contrast-tested series. Native browser controls follow the appropriate `color-scheme`; test date inputs, selects, autofill, scrollbars, disabled controls, and file inputs.

## Persistence and privacy

Theme choice is device/browser preference, not authorization. It can survive logout because it contains no HR data. On shared devices do not persist role, last employee, salary, or private filters in the theme cookie. Optional account-wide preference sync is deferred; it would use an authorized server action, not direct component fetching.

Print styles always produce readable light documents with explicit borders. Generated payslip/report PDFs use their own approved light template independent of the user's active theme.

## Failure handling and verification

Invalid cookie values fall back to system. Blocked cookies still allow current-session theme changes. OS changes update system mode only; explicit user choice stays stable. Theme switching must preserve focus, scroll, input values, dialog state, and pending actions.

Acceptance cases: cold start in each mode, system changes with app open, explicit preference after reload, JavaScript disabled server rendering, CSP enabled, slow network, hydration logs clean, keyboard toggle, high-contrast mode, and both-theme visual snapshots. Measure contrast on rendered hover/focus/error/disabled states; sample calculations are not a complete accessibility audit. No full-page theme fade or flash; reduced-motion behavior is static.
