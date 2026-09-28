# Mobile, native, and web

Status: web-first platform plan · Owner: Product + Mobile/Frontend Leads · Updated: 2026-09-28

## Delivery order

Build responsive Next.js web first, then an installable PWA shell after security/cache validation. Native applications are a later phase justified by measured employee needs. React Native + TypeScript is the OSS candidate; record exact dependency, native Iconsax, device and distribution decisions before native code. A free framework does not make platform SDKs, stores or device-management services free/open source. Web/PWA remains the required delivery path without mandatory store services or cloud builds. Native delivery must not delay correct Core HR, leave, attendance, and payroll. See [tech stack](tech-stack.md).

## Capability matrix

| Capability | Desktop web | Mobile web / PWA | Native later |
| --- | --- | --- | --- |
| Own profile/directory | Full | Full, responsive | Equivalent authorized subset |
| Attendance/regularization | Full online | Full online; permission-aware capture | Online initially; native permission UX |
| Leave and approvals | Full | Full | Full |
| Own payslips/documents | Secure download | Secure download with shared-device caution | Secure viewer/download with platform controls |
| HR bulk imports/employee administration | Full | Read/review and accessible forms; large tasks best on desktop | Out of initial native scope |
| Payroll calculation/approval | Full | Responsive review, step-up controls | Out of initial native scope |
| Reports | Full, async exports | Summary and authorized download | Selected summaries |
| Notifications | In-app first; approved email | In-app; push optional and platform-dependent | Push optional with minimal payload |
| Offline sensitive actions | No | No | No at first release |

Authorization, workflow states, and calculations are identical across platforms. Hidden native features are not authorization controls. Contracts come from [API contract](api-contract.md); types may be shared but mobile must runtime-validate network responses.

## Native architecture requirements

Use platform-appropriate UI, secure OS credential storage, OAuth authorization-code with PKCE through the system browser, short-lived access tokens, refresh rotation, and revocation. Never embed a client secret in the app or place tokens/HR records in unencrypted preferences. Access tokens are audience-bound; private downloaded files need lifecycle controls and explicit user intent.

For native clients, network requests live in a centralized API/data layer and are invoked through feature controllers; presentational UI never fetches. The page-only fetch rule applies to Next.js pages and remains unchanged for the web implementation. Native has screen/controller equivalents rather than server-rendered pages.

Shared packages can contain DTOs, runtime schemas, safe formatting, and design token source data. Server-only payroll, permissions, secrets, and repositories must never enter mobile bundles. The server makes final decisions even if native displays a local validation hint.

## Device and location behavior

Request camera, location, file, or notification permission at the specific action with a reason. Denial offers the approved alternative. No continuous/background employee tracking or automatic contacts/calendar access. Geolocation is evidence subject to uncertainty/spoofing, never sole proof of misconduct. Selfie/face recognition is excluded pending a separate approved privacy/security/product review.

Device biometrics, if offered, may unlock a locally protected session credential; they do not send face/fingerprint templates to GTF or replace server identity checks. Lost-device support revokes tokens and push registration. Remote revocation cannot retract screenshots or files a user already exported; do not promise it can.

## Release operations

Maintain separate signing keys, build identities, and staging/production app identifiers. Protect signing credentials through the approved self-hosted secrets/CI design. Document distribution choice, fees and platform terms, minimum OS versions, device matrix, privacy disclosures, deep-link allowlists, app-link verification, crash redaction, and rollback/minimum-version policy. No store account, paid cloud build or push provider is required or configured; distribution that conflicts with the free-software/resource constraint remains outside the core release.

Backward-compatible API rollout precedes native releases. Never break an old client silently; provide a supported-version window and clear upgrade path. Mobile network failures use persisted command IDs only if no sensitive content is retained; initial release does not queue attendance/financial mutations offline.

## Acceptance

Test small/large phones, safe-area insets, text scaling, screen readers, keyboard where applicable, weak connectivity, background/foreground transitions, expired sessions, revoked device, duplicate taps, denied permissions, interrupted upload, and link hijacking attempts. Parity tests assert the same employee cannot access another employee's salary on any platform. [PWA](pwa.md) defines web installation/offline specifics.
