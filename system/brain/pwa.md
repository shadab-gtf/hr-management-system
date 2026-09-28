# Progressive web app specification

Status: later core-release enhancement after online web validation · Owner: Frontend + Security · Updated: 2026-09-28

## Purpose

Make daily employee workflows easy to launch from a device home screen while keeping HR data online and access-controlled. Installation is optional; every essential workflow works in the normal browser. This file complements the ambiguous requested [PWD topic](pwd.md).

## Manifest and assets

Use a typed Next.js manifest with approved product name, short name `GTF HR`, scope, start URL, standalone display mode, theme/background colors, and appropriately sized standard/maskable icons. Reserve safe padding around the supplied logo; do not clip its strokes. The 500×277 reference is not a ready-made square app icon: create and review icon assets in the implementation phase.

Start URL must resolve through normal authentication to a safe landing page; it cannot contain an employee ID, token, private filter, or salary context. App shortcuts, if used, are generic navigation entries with normal authorization on arrival. No public cached screenshot includes real employee data.

## Service-worker cache policy

| Resource | Policy |
| --- | --- |
| Versioned public JS/CSS/icons/fonts | Explicit precache allowlist, content-hashed versions |
| Generic offline page | Precache; contains no identity or employee data |
| Login/OIDC callback/session endpoints | Network only, never stored |
| Authenticated HTML/navigation | Network only; offline fallback is generic |
| API, React server payloads, server actions | Network only; never cache |
| Payslips, documents, exports, avatars behind authorization | Network only; never cache |
| Private error pages and redirect responses | Never cache |

Use an allowlist of public static assets, not a broad cache-everything rule with a few exclusions. Test route-prefetch/RSC requests, query variants, POST responses, and framework changes. Clear obsolete static caches on activation. Logout also clears any application-owned sensitive transient state; no private persistent cache should exist to begin with.

## Offline behavior

Display a generic “You are offline” screen with a retry control and no previously viewed HR records. Attendance capture, leave submission/approval, profile changes, document retrieval, and payroll commands are unavailable offline. Do not claim an action is saved unless the server durably acknowledged it.

Draft persistence is disabled for sensitive forms. A future offline capture design requires a separate ADR addressing trusted timestamps, device clock changes, replay, token revocation, storage encryption, stale policy, and conflict review. It must not be slipped into a service-worker update.

## Updates and notifications

Detect an available worker version and show a nonblocking update notice. Do not force reload during an unsaved form, upload, or command confirmation. Once safe, activate and reload with clear feedback. Keep the previous compatible static assets long enough for active clients; server/API migrations remain backward compatible.

Push notifications are optional and require explicit user opt-in, server-side subscription ownership, revocation, expiration cleanup, and capability detection. Payloads contain generic notices such as “You have a new HR update”, not salary, leave reasons, document URLs, or employee details. Deep links authorize after open. Do not assume all target browsers support the same install/push features; validate the declared device matrix during implementation.

## Acceptance

Inspect Cache Storage, IndexedDB, browser storage, HTTP cache headers, and service-worker requests after viewing payroll/profile/document pages. Repeat across logout, login as another user, revoked sessions, network loss, and worker upgrade. Verify no private payload persists, offline page is generic, duplicate commands do not occur on reconnect, and stale worker assets do not break login.

Installability, icons, safe area, keyboard/screen-reader behavior, and manifest metadata are reviewed on the supported browser/device matrix. Shipping an install prompt alone does not complete this feature. [Security](security.md) and [testing](testing.md) define release gates.
