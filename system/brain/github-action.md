# CI/CD — self-hosted Forgejo and optional GitHub compatibility

Status: workflow specification; no repository/workflows currently exist · Owner: Engineering + Operations · Updated: 2026-09-28

The filename preserves the original requested “GitHub Action” topic. The updated free/open-source baseline uses **Forgejo + Forgejo Runner on company-controlled infrastructure**. GitHub is not required for repositories, private CI, deployments or security checks. Optional GitHub compatibility is documented separately below; it is not labeled an OSS hosted platform or an unlimited free resource. See [tech stack](tech-stack.md) and [free resources](free-resources.md).

## Repository protection

Initialize a repository only as part of the implementation work. Protect the default branch with required checks, review, and restricted force-push/deletion. Use CODEOWNERS for authorization, payroll, database migrations, infrastructure, and this specification. Payroll/rule/security changes require the responsible domain reviewer as well as engineering review.

Use least-privilege Forgejo tokens and separate untrusted-test/trusted-release runners. Grant write/deploy access only to the job needing it. Deployment uses a restricted identity and short-lived credentials where the validated self-hosted design supports them, with OpenBao-backed custody/revocation. Pin third-party actions to reviewed full commit SHAs and check their licenses/runtime/platform assumptions. Prefer portable repository scripts over marketplace actions that call proprietary hosted APIs. Validate actual Forgejo support instead of copying GitHub permission/environment syntax blindly. [Forgejo Actions reference](https://forgejo.org/docs/latest/user/actions/reference/)

## Workflow inventory

| Planned workflow | Trigger | Jobs / artifacts | Blocking behavior |
| --- | --- | --- | --- |
| `ci.yml` | Pull request, default-branch push | format/lint, typecheck, unit, integration, contract, build, E2E, accessibility, bundle checks | Required checks fail merge |
| `security.yml` | PR + scheduled supported cadence | secrets, dependencies, static analysis, SBOM | Critical/high exploitable findings block release; triage documented |
| `preview.yml` | Trusted PR after CI | isolated synthetic environment, smoke, Lighthouse report | No production identity/HR data/secrets |
| `release.yml` | Approved release tag/dispatch from protected commit | build once, provenance, staging, migration rehearsal, environment approval, production deploy, smoke | Failure halts promotion; tested rollback |
| `maintenance.yml` | Approved schedule/manual trigger | dependency report, backup/restore drill orchestration, synthetic health | Separate least-privilege credentials and logs |

These are intended filenames under `.forgejo/workflows/`, not installed workflows. Exact action sources/SHA pins, Node/pnpm versions and commands are validated in MT-031. Use Podman-backed isolated execution where compatible with the selected runner, or another reviewed OSS-compatible execution mode; do not assume a Docker socket is safe. No job receives the production container-engine socket or unrestricted host privileges.

## CI job graph

Checkout → lockfile install → parallel static/type/unit checks → PostgreSQL-backed integration and API contract checks → production build → critical E2E/accessibility/performance checks → immutable evidence upload. Security checks run independently but are required before release. Tests must run against the actual supported PostgreSQL version, not an SQLite substitute for locking/RLS.

Proposed package scripts to create during scaffold: `lint`, `typecheck`, `test:unit`, `test:integration`, `test:contract`, `test:e2e`, `test:a11y`, `build`, and `check:budgets`. Do not assume they exist today or report them as passing. Cache package downloads keyed by OS/runtime/lockfile; do not cache credentials, private responses, or mutable DB state across jobs.

Set explicit job timeouts, bounded matrices and cancellation for superseded test runs using supported runner features or portable coordination scripts. Do not cancel a production migration/deployment because another commit arrives. An enforced deployment lock permits one production release at a time. Artifacts contain safe synthetic screenshots, redacted logs, test reports, bundle reports, SBOM/notices and migration plans; retention is limited and access controlled.

## Untrusted pull requests

Fork PR jobs have no deployment credentials or production secrets. Never run their code in an event/context with elevated access; on an optional GitHub mirror, this includes unsafe `pull_request_target` usage. Interpolated PR titles, branch names, issue text or labels must never become shell code. Review third-party actions and sanitize structured inputs without shell interpolation.

Preview environments use synthetic data, isolated storage, restricted egress, expiring credentials, and automatic teardown. They must not join the production identity tenant or send messages to real employees. Workflow runners cannot reach production databases from ordinary test jobs.

## Promotion and migrations

1. Build an immutable artifact from a protected commit; record digest, lockfile, runtime, SBOM, and provenance.
2. Deploy that artifact to staging, apply expand-only migration, run critical smoke/security/reconciliation checks, and validate backward compatibility with the previous version.
3. Obtain a reviewable production release approval bound to the artifact digest and evidence bundle. On Forgejo, implement a protected release record plus separate authorized promotion job/runner; do not assume GitHub-style environment approvals exist. Prevent a PR-controlled script from approving or changing its own target artifact. This is a future release control, not a request for permission to write these documents.
4. Ensure current backup/recovery readiness, migration lock, and named operator. Apply approved compatible schema changes once.
5. Deploy web and workers in a compatible order, monitor readiness and canary metrics, then increase traffic. Run synthetic authorization/attendance/leave checks without touching real payroll.
6. Confirm error/latency/queue budgets and publish release notes. Keep prior artifact and migration compatibility window available.

Contract/destructive migrations occur only after old code and clients no longer depend on fields. Never combine irreversible schema deletion with the first code rollout. Production data migration has its own row-count/reconciliation and recovery plan.

## Failure/rollback evidence

On failed smoke or SLO regression: stop promotion, disable affected features, restore the previous compatible artifact, reconcile in-flight jobs, and notify the named release owner. Do not blindly reverse DB changes or reissue payroll/payment commands. [Operations](operations.md) provides the runbook.

Release evidence must include commit/artifact digest, reviewers, successful required checks, known exceptions with expiry, migration result, rollback rehearsal reference, and post-deployment observation. [Production checklist](production-checklist.md) defines launch readiness beyond a green pipeline.

## License and self-hosted resource gates

Run local OSS Gitleaks/Trivy/Syft plus dependency-license checks on reviewed versions. Compare every npm/container/plugin/artwork artifact against approved SPDX/notices; retain the exact Iconsax provenance decision. Unknown/prohibited licenses, premium feature dependencies and unreviewed network services block release. Copyleft obligations are reviewed for actual use; do not automatically reject all GPL/AGPL software as paid.

Capacity belongs to GTF: CPU/RAM/disk, isolated workers, registry/artifact storage, dependency mirrors if needed and backup/patch ownership. No public free-tier quota or paid GitHub security product is required. Test jobs must not compete with production payroll on the same unrestricted host.

## Optional GitHub compatibility

If separately requested later, port portable scripts to `.github/workflows/` and revalidate each event/action/security control. Default GitHub permissions would be `contents: read`, with job-specific escalation, fork isolation, pinned actions and no secret-bearing execution of untrusted PR code. [GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use)

Account features, hosted runner billing/quotas and private-repository protections must be checked at that time. GitHub is optional; no GitHub repository, cloud account or subscription is created by this specification.
