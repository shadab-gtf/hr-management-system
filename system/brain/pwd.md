# PWD — passwords and recovery

Status: terminology assumption; local credentials optional · Owner: Identity/Security Lead · Updated: 2026-09-28

“PWD” was supplied without expansion. This file covers password and account-recovery controls. The separate [PWA specification](pwa.md) covers progressive web app behavior. If “PWD” meant another feature, record a decision and update this file before implementing that feature; no password subsystem is implied merely by the filename.

## Authentication decision

Self-hosted Keycloak community SSO/OIDC is the baseline. Do not implement a local password database when it covers employees and administrators. MFA, password policy, recovery, and suspicious sign-in controls should be enforced by the IdP and verified through integration tests. No paid authentication service is required. See [tech stack](tech-stack.md) and [roles and permissions](roles-permissions.md).

If a justified local-account use case remains, Security must approve the threat model, operational owner, and lifecycle. Do not use local accounts as an automatic bypass when the IdP is unavailable. Emergency accounts are separately managed, highly restricted, audited, and exercised under the incident process.

## Proposed local-credential requirements

- Accept long passphrases, spaces, Unicode, paste, password managers, and autofill. Proposed minimum 15 characters, maximum at least 128 characters; reject known breached/common credentials using a privacy-preserving approved service or local blocklist.
- Do not silently truncate or impose arbitrary periodic resets without risk justification. Require reset after compromise, verified credential leak, or account recovery as appropriate.
- Hash using a maintained Argon2id implementation with unique random salt; benchmark parameters against resource limits and current security guidance at implementation time. Parameters are versioned for rehash-on-login. No reversible password encryption or plaintext logging.
- Rate-limit per account and network/device signals, with progressive delays and abuse monitoring. Do not enable easy permanent lockout attacks. Use generic login/recovery errors to reduce account enumeration.
- MFA is mandatory for privileged roles. Prefer phishing-resistant authenticators supported by the IdP; recovery must not be weaker than ordinary authentication.

## Recovery protocol

Request → generic acknowledgment → rate-limited delivery to a previously verified channel → random single-use token stored only as a hash → proposed 15-minute expiry → new credential setup → token invalidation → session/refresh-token revocation → security notice.

Never send passwords by email, reveal an account exists, use employee birth date/government ID as a secret, or expose reset tokens in logs/referrers/analytics. Recovery pages use a restrictive referrer policy, no third-party scripts, and no caching. Repeated redemption and expired tokens fail safely. Changing a recovery channel requires current authentication, verification, and audit; recent channel changes may require additional review for privileged recovery.

## UI and operations

Inputs use correct autocomplete attributes, accessible labels, reveal/hide controls, and clear requirements before submission. Strength guidance must not block password-manager-generated values arbitrarily. Security notices contain no secret or salary data. Support staff cannot read or set an employee's existing password.

Acceptance: correct/incorrect login, generic error equivalence, brute-force limits, recovery replay, expiry, token redaction, all-session revocation, MFA recovery, compromised-channel handling, and accessible keyboard/password-manager behavior. Final local-password policy must be reviewed against current primary guidance during implementation; this document does not claim an implemented identity system.
