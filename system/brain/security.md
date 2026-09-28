# Security and privacy

Status: required control baseline; implementation unverified · Owner: Security + Privacy · Updated: 2026-09-28

## Classification and access

| Class | Examples | Handling |
| --- | --- | --- |
| Public | Approved logo, generic sign-in copy | Public delivery after brand approval |
| Internal | Work directory, announcements, policies | Authenticated, audience-scoped |
| Confidential | Attendance, leave reasons, reviews, employee files | Record/field access, export audit, no shared cache |
| Restricted | Salary, bank/tax/government identifiers, medical attachments, credentials | Explicit privilege, encryption/minimization, step-up for sensitive actions |

Do not collect identifiers or medical information merely because another HR product supports them. Each collected field needs purpose, owner, access list, retention, and approved processing basis. Directory data is not public internet data.

## Authorization matrix

| Operation | Employee | Manager | HR | Payroll operator | Finance approver | IT admin |
| --- | --- | --- | --- | --- | --- | --- |
| Read own private profile | Allowed fields | Own | Scoped HR fields | Only payroll-required fields | Only approved payroll scope | No default |
| Read safe directory | Yes | Yes | Yes | Yes | Yes | As member |
| Approve team leave | No | Assigned team, not self | Explicit fallback scope, not self | No default | No default | No |
| Read team salary | No | No default | Separate payroll grant only | Assigned pay group | Assigned pay group | No |
| Run payroll | No | No | Separate grant | Yes | Separate operator grant; cannot approve own work | No |
| Approve payroll | No | No | No default | Cannot approve own run | Independent named approver | No |
| Manage identity/roles | No | No | Limited employee invitations | No | No | Explicit admin scope |
| Read audit/export | Own receipt only | Scoped request history | Scoped | Scoped payroll history | Scoped financial history | Security metadata only unless separately authorized |

Permissions combine capability, organization/entity scope, effective employment relationship, object ownership, field classification, and workflow state. Evaluate them in domain services and query adapters. PostgreSQL RLS reinforces organization boundaries. Deny by default. A manager transfer must not automatically expose historic confidential records outside the approved history-access policy.

## Identity and privileged access

Self-hosted Keycloak community SSO with MFA is the default, integrated through a reviewed OIDC client and revocable server sessions. Role assignment is an audited privileged action; requester cannot approve their own privilege increase. For sensitive bank changes, payroll approval, and bulk restricted exports require recent step-up authentication. Proposed sessions: 30-minute idle and 8-hour absolute web expiry; payroll/privileged idle 15 minutes. Final values require IdP and operational validation. [Roles and permissions](roles-permissions.md) owns capability keys and detailed scope enforcement.

Offboarding revokes identity access, sessions, refresh tokens, service/device grants, delegated approvals, and outstanding download access according to effective exit time. Check revocation on protected requests; stale UI never grants access. Emergency access is time-limited, reason-bound, independently approved, and reviewed after use. Never share administrator accounts. [PWD](pwd.md) owns optional local credential rules.

## Threat model and controls

| Threat | Required prevention / evidence |
| --- | --- |
| IDOR / cross-organization access | Server record checks, composite FKs, RLS; direct URL and API negative tests |
| Sensitive fields in HTML/React payload | Explicit DTO projection; response inspection tests, not CSS hiding |
| CSRF / session theft | Secure cookie flags, origin/CSRF validation, rotation, short-lived tokens |
| XSS / malicious rich text | Escaped rendering, strict sanitization, CSP; no raw imported HTML |
| SQL injection / unsafe reporting | Parameterized queries, allowlisted sort/filter/report fields |
| Upload malware / object traversal | Scoped keys, MIME sniffing, size/pixel/page limits, scan quarantine, authenticated downloads |
| SSRF / webhook abuse | Egress allowlists, IP/redirect checks, signatures, timestamp windows, replay records |
| CSV formula injection | Export dangerous prefixes as non-executable text; verify Excel/Sheets behavior |
| Replay / double pay / double leave use | Idempotency, transactional posting, unique constraints, state/version checks |
| Insider misuse / privilege creep | Separation of duties, expiring grants, quarterly proposed access review, export alerts |
| Supply-chain compromise | Lockfile, provenance/SBOM, secret/dependency scanning, pinned CI actions |
| Employee surveillance misuse | No continuous location, covert recording, face recognition, or productivity scoring in scope |

## Encryption, files, and secrets

HTTPS everywhere with supported TLS, HSTS after domain validation, and secure service-to-service channels. Configure host/volume encryption for self-hosted database/object stores, encrypted backups, and envelope encryption for selected highly sensitive identifiers with self-hosted OpenBao key operations or a reviewed equivalent OSS design. Verify the selected storage/key integration rather than assuming managed KMS features exist. Store encryption-key IDs, rotate via dual-read/re-encrypt migration, test restore with keys, and separate key administration from data access. Software being free does not eliminate key custody and recovery responsibilities.

No secret values in Git, public environment variables, CI output, telemetry, or browser bundles. Use workload identity/short-lived credentials where available. Secrets are environment-specific and access-audited. Redact identifiers, amounts, leave reasons, document names, and request bodies from routine logs. Do not use production HR data in preview/staging; use synthetic data or formally approved irreversible de-identification.

All objects are private. Original filename is metadata, never an executable path. Download checks current scope and scan status. Prevent public ACLs and object listing. Preview/PDF generation runs in a constrained worker with no arbitrary outbound network or local-file access. Storage URLs and decrypted document bytes do not enter shared caches.

## Privacy and retention governance

Maintain a processing inventory: purpose, category, source, approved basis, controller/processor roles, recipients, storage region, retention trigger, deletion method, employee notice, and contact/complaint workflow. Do not use a blanket employee consent checkbox as a substitute for analyzing each purpose. Optional location collection has a just-in-time notice, minimum precision, short approved retention, and an alternate exception route.

Map access/correction/erasure requests through authenticated intake, identity verification, legal obligation/hold review, execution, and documented response. Delete eligible derivatives and object versions as well as primary rows. Immutable audit records contain minimal identifiers/references; avoid embedding raw secrets or full private before/after values. Legal holds suspend only justified record classes, with owner and review date.

MeitY's official publication page includes DPDP Rules 2025, a corrigendum, and a separate enforcement timeline. The privacy owner must review applicable commencement dates and duties before launch; this specification does not assert that every provision is already effective or that the application is certified compliant. [Official MeitY publications](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025%3B)

## Audit and incident response

Audit actor, organization, action, target reference, reason, permission context, time, request/job ID, and safe changed-field names. Record sensitive reads/downloads, exports, role changes, approvals, policy changes, payroll state transitions, and failed privileged attempts. Append-only DB permissions plus periodic signed digests in separately controlled immutable storage provide tamper evidence; a database table alone is not immutable against administrators.

Security incidents follow [operations](operations.md): contain, preserve redacted evidence, revoke compromised credentials, assess affected people/records, engage designated privacy/legal owners, determine applicable notifications/deadlines, recover, and document actions. Do not invent a universal statutory reporting deadline. Test the notification decision workflow before production.

## Release evidence

Use an agreed OWASP ASVS Level 2 control mapping as the baseline, with enhanced review for payroll and privileged workflows. This is an internal target, not an OWASP certification. [OWASP ASVS](https://owasp.org/projects/asvs)

Required evidence: threat model reviewed, scoped negative tests, session revocation drill, private-cache inspection, malicious upload tests, dependency/secret scan triage, backup access/restore test, retention register, independent security review, and no unresolved critical/high exploitable security finding at release. Risk exceptions require an accountable owner, compensating control, expiry, and documented approval; unauthorized disclosure paths block launch.
