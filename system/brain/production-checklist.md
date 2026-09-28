# Production checklist

Status: all application launch gates pending · Owners: Product, HR, Finance, Engineering, Security, Operations · Updated: 2026-09-28

Every item requires dated evidence, named reviewer, and release/artifact reference. A written specification alone does not check a launch item. Gates marked blocking cannot be waived merely to meet a date.

## Business and policies

- [ ] Named sponsor, Product Owner, HR, Finance approver, Security/Privacy contact, and on-call owner assigned.
- [ ] Legal entities, locations, employee count, employment categories, working calendars, and jurisdictions verified.
- [ ] Leave/attendance/shift/approval/delegation policies versioned and approved.
- [ ] Payroll cut-off, proration, rounding, component definitions, statutory rules, payment process, and final settlement approved. **Blocking.**
- [ ] Purpose/retention/processing register and employee notices approved; applicable legal commencement dates reviewed.
- [ ] Rollout cohort, training, support channel, fallback process, and payroll-close change freeze agreed.

## Data and access

- [ ] Migration dry run and committed row-level reconciliation signed by HR/Finance. **Blocking.**
- [ ] No duplicate employee identities, manager cycles, unassigned policy mappings, or unexplained opening balances.
- [ ] SSO/MFA, role/record/field scopes, separation of duties, and revocation tested. **Blocking.**
- [ ] No production HR data in staging, logs, screenshots, analytics, or CI artifacts.
- [ ] Bank changes verified; payment export format accepted by Finance through a non-payment test process.
- [ ] No ad SDK, unapproved tracking, automated scraping, or prohibited biometric/location collection.

## Application quality

- [ ] Strict TypeScript, boundary rules, production build, critical unit/integration/contract/E2E checks pass.
- [ ] Global and route loading/error states, matching skeletons, empty/partial-failure/offline states verified.
- [ ] Accessibility manual tasks pass; no critical/serious unresolved automated violation on key journeys.
- [ ] Light/dark themes, 360px/mobile, tablet/desktop, 200% zoom, and reduced motion reviewed.
- [ ] Lighthouse and transfer/latency budgets measured against representative data; exceptions documented with expiry.
- [ ] Client bundles, HTML/React payloads, caches, and exports contain only authorized fields. **Blocking.**
- [ ] API compatibility and native/PWA update behavior verified for enabled platforms.

## Payroll readiness

- [ ] All active rule versions have official source/effective-date evidence and qualified approval. **Blocking.**
- [ ] Two consecutive shadow periods reconcile per employee/component; every variance resolved or signed. **Blocking.**
- [ ] Input freeze, deterministic rerun, independent approval, digest verification, and publication tested.
- [ ] Immutable closed results, late-event adjustment, off-cycle/final-settlement rules, and reversal flows tested.
- [ ] Payment intent uniqueness and partial/failed acknowledgment reconciliation tested. **Blocking.**
- [ ] Payslip artifacts verified against approved results; unpublished artifacts inaccessible.

## Infrastructure and security

- [ ] Production topology, region, capacity, cost owner, domains/TLS, and private storage verified.
- [ ] Self-hosted secrets/key access and recovery, rotation, least privilege, RLS, network controls, and security headers verified.
- [ ] Pinned package/image/asset licenses, SBOM and third-party notices reviewed; exact Iconsax artifact/provenance and React compatibility checked.
- [ ] Required functionality runs with the approved OSS editions and no paid trial/API/premium feature; real infrastructure/staffing/mail costs recorded separately.
- [ ] Malware scanning and safe document/PDF/export processing verified.
- [ ] No unresolved critical/high exploitable security findings; independent review complete. **Blocking.**
- [ ] Private-cache/PWA tests pass across logout and cross-user sessions. **Blocking.**
- [ ] Backup freshness and isolated restore drill meet approved RPO/RTO with objects/keys/payment reconciliation. **Blocking.**
- [ ] Alert delivery, on-call acknowledgment, incident/privacy notification decision process, and runbooks rehearsed.

## Release and rollback

- [ ] Protected commit, immutable artifact digest, SBOM, reviewers, and required CI evidence attached.
- [ ] Expand/backfill/contract migration plan and previous-version compatibility verified.
- [ ] Staging smoke, migration rehearsal, and rollback exercise passed. **Blocking.**
- [ ] Single production migration runner, release operator, rollback authority, and observation window assigned.
- [ ] Synthetic production smoke validates sign-in, scope denial, attendance, leave, jobs, and document protection.
- [ ] Queue age, errors, latency, object access, and audit delivery stable during staged rollout.
- [ ] HR/Finance/Security/Operations record final go/no-go decision before broad employee access.

## After launch

- [ ] Daily review during initial pilot covers exceptions, rejected imports, job failures, permission issues, and support trends.
- [ ] First live payroll uses the approved dual-control process and reconciliation evidence.
- [ ] Access review, restore drill, retention job review, patch cadence, and policy-source checks scheduled with owners.
- [ ] Release notes, [completed list](completed-list.md), [changelog](changelog.md), and known limitations updated from actual evidence.

Failure of a blocking gate stops the affected rollout. A partial release may proceed only if scope excludes the unready capability and the exclusion is explicit; for example, ESS/leave pilot does not imply live payroll readiness.
