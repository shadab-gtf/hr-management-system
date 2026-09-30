# Roles, permissions, and authorization

Status: normative security model · Owner: Security + domain owners · Updated: 2026-09-28

## Implementation and libraries

Use self-hosted Keycloak for login/MFA and `openid-client` for OIDC, Zod for validated inputs, and PostgreSQL/Drizzle for scoped persistence. Implement a small typed central policy module in `lib/server/auth/`; no paid RBAC platform or extra permission library is needed. Keycloak realm roles alone cannot express employee/team/pay-period/field/business-state rules. Do not duplicate permissions in browser stores.

Read [security](security.md) for the threat model and [user flows](user-flow.md) for journeys. Permission keys below are the canonical implementation vocabulary for the initial policy seed; migration/testing must keep API/action enforcement and the seed synchronized.

## Role bundles

| Role | Typical scope | Granted purpose | Explicit exclusions |
| --- | --- | --- | --- |
| Employee | Own linked employment + safe directory | Own records, attendance, leave, published payslips, tickets/claims | Other salaries/private documents; approving own requests |
| Manager | Assigned team, effective-date-aware | Team time/leave review, scoped requests and reports | Team salary/bank/medical documents by default |
| HR operator | Named entities/locations | Employee lifecycle, policy administration, scoped personnel records | Payroll/bank access unless separately granted |
| Payroll operator | Named pay groups | Inputs, compensation setup, calculations and submission | Approval of own run; role administration |
| Payroll approver | Named pay groups | Independent run review/approval | Self-approval; implicit identity administration |
| Payroll publisher | Named pay groups | Publish approved immutable results | Change calculations or bypass approval |
| Finance settlement operator | Named pay groups/batches | Bank export, acknowledgment reconciliation | Unapproved transfers, salary edits through payment workflow |
| IT administrator | Identity/integration scope | Accounts, membership, connectors and operational configuration | Default payroll/personnel-file visibility |
| Security administrator | Security metadata, approved role administration | Access reviews, grants, incidents and audit | Unrestricted HR content or self-approved privilege elevation |
| Auditor | Time-limited named entities/domains | Read-only approved audit/report scope | Mutations; automatic bulk export permission |
| Leadership | Approved aggregate scope | Workforce/cost summaries | Record-level salary/medical details by default |
| Service principal | Named connector/job/domain | Machine operations with minimal capabilities | Human privilege impersonation or unrestricted data scanning |

Role bundles may coexist. An explicit business prohibition overrides their union: holding operator+approver still cannot approve a run one created or materially prepared. Small teams need a real independent approver, not a UI role switch.

## Capability catalog and default assignment

| Key | Default actor | Server conditions |
| --- | --- | --- |
| `directory.read` | Active member | Safe DTO only, organization scope |
| `profile.read.self` | Employee | Verified user/employment link |
| `profile.change.request` | Employee | Allowlisted fields; sensitive changes enter verification workflow |
| `employee.read` | HR; limited manager | Entity/team + field projection + historical-access policy |
| `employee.create` / `employee.update` | Scoped HR | Entity scope, version/effective-date validation, audit |
| `attendance.capture.self` | Employee | Own active employment, permitted source/window, duplicate protection |
| `attendance.ingest` | Connector principal | Source and organization allowlist, signature/credential/replay checks |
| `attendance.read.self` / `attendance.read.team` | Employee / manager | Own link / effective team scope |
| `attendance.regularize.request` | Employee or explicit HR | Permitted target and correction window |
| `leave.request.self` / `leave.cancel.self` | Employee | Policy eligibility, balance/overlap/state and workflow checks |
| `approval.decide` | Eligible assigned manager/HR/delegate | Correct workflow step, no self-approval, current version |
| `compensation.manage` | Payroll operator | Pay-group scope; draft/effective-date approval rules |
| `payroll.prepare` / `payroll.calculate` / `payroll.submit` | Payroll operator | Authorized group/period, validated inputs, unique run |
| `payroll.approve` | Payroll approver | Independent actor, fresh step-up, digest/version match |
| `payroll.publish` | Publisher | Approved immutable run, complete artifact checks |
| `payment.export` / `payment.reconcile` | Finance settlement operator | Approved run/batch, verified bank version, idempotency |
| `payslip.read.self` | Employee | Own result, published artifact, permitted retention/access window |
| `document.upload` / `document.read` | Authorized employee/HR/domain operator | Owner relationship + classification + scan state; not a blanket file grant |
| `import.validate` / `import.commit` | Scoped operator / reviewer | Domain field rights, approved digest, reviewer independence where required |
| `report.read` / `report.export` | Scoped domain role | Approved report + filter/field scope; export is a separate grant |
| `audit.read` / `audit.export` | Scoped auditor/security/domain role | Domain/time scope and safe event projection |
| `policy.draft` / `policy.publish` | HR/Finance according to domain | Versioned rule ownership, independent approval where specified |
| `identity.manage` / `integration.manage` | IT | Named scope, step-up for sensitive changes, no content access implication |
| `role.grant.request` / `role.grant.approve` | Authorized admin / independent approver | Requested scope/expiry/reason; no self-elevation |

Implemented in the FE3 mock seed (review before the live policy seed): `event.manage`, `letter.issue` and `import.commit` for HR operators; `loan.approve` for payroll approvers; `compensation.manage` for payroll operators, whose salary batches need an independent `payroll.approve` holder. `policy.publish` currently covers holidays, leave types, shifts/overtime, sites, organization and probation.

Later modules add namespaced keys (for example `expense.submit.self`, `expense.approve`, `performance.review.release`, `recruitment.read`) in reviewed permission-seed migrations before implementation. Avoid wildcard permissions in UI or arbitrary permission strings from browser input.

## Evaluation algorithm

1. Authenticate and validate session/token issuer, audience, expiry and revocation.
2. Resolve active organization membership and verified employee/service identity; never trust submitted actor IDs.
3. Resolve active role assignments and scope/validity from authoritative policy data.
4. Verify the requested capability and organization/entity/pay-group/team/own relationship.
5. Check object classification and allowed field projection, including export/download implications.
6. Apply workflow/state constraints, segregation of duties, delegation limits, step-up age and expected version/digest.
7. Execute within scoped repository/transaction context, enforce RLS/constraints, and atomically audit critical changes.
8. Return a minimal DTO/typed result. Denials are safe and do not disclose resource existence where policy requires concealment.

Permissions are checked again when a worker executes and when an artifact is downloaded, according to the job's approved system-operation model. A user-created export does not retain unlimited rights after the user is disabled. Periodic system jobs use explicit service identities; they do not depend on an arbitrary administrator browser session.

## UI behavior

The page may supply booleans or a minimal `capabilities` DTO for actions in that view. Components use it for understandable navigation/disabled reasons only. They never download all employee role assignments or evaluate salary access from a stored role name. An attacker editing browser state still fails the server command/query. Hidden content must be absent from serialized payloads, not merely hidden with CSS.

Historical team access is a policy decision separate from current team membership. Delegation is bounded by dates, workflow type, original approver rights and anti-cycle checks. Delegating to the requestor does not override the self-approval prohibition. Role revocation invalidates or versions any permission cache; no process-global cross-user authorization cache.

## Grant, review and emergency process

Request grant → validate requested capability/scope/expiry/reason → independent approval → persist versioned assignment and audit → invalidate session-effective capability view → notify safely → review/expire. A denied/expired grant changes no rights. Access reviews must include service accounts, delegated approvals, bank export access and dormant privileged memberships.

Break-glass access needs named identity, reason, short validity, independent approval where feasible, critical alert and post-incident review. It must not grant silent unrestricted data access or become a permanent super-admin workaround.

## Acceptance scenarios

Test own versus other employee, current versus historical team, entity/pay-group boundaries, hidden fields, direct URL/action/API calls, service principal limits, missing scan/publication state, expired/revoked role, cache reuse across sessions, delegation to self, actor with multiple roles, old approval digest, changed rights during export and absent step-up. T-01–03/T-06/T-10/T-14/T-17/T-21 cover these surfaces; add cases whenever the capability catalog changes.

## FE4 capability additions (mock grants, 2026-09-30)

| Capability | Mock roles | Purpose |
| --- | --- | --- |
| `statutory.manage` | payroll operator, payroll approver | Statutory setup, identifiers, returns, challans, Form 16 generation |
| `timesheet.submit.self` / `timesheet.approve` / `project.manage` | employee / manager / manager, HR | Timesheets, approvals, projects |
| `roster.manage` | manager, HR | Shift roster planning, publishing and swap decisions |
| `exit.request.self` | employee | Resignation |
| `settlement.prepare` / `settlement.approve` | HR, payroll operator / payroll approver | F&F maker and independent checker |
| `asset.read.self` / `asset.manage` | employee / HR | Own assets and requests; inventory and assignment |
| `performance.self` / `performance.review` / `performance.manage` | employee / manager / HR | Goals and reviews; team reviews; cycles and calibration |
| `recruitment.manage` / `candidate.interview` | HR / manager | ATS administration; requisitions and scorecards |
| `survey.manage` | HR | Surveys and poll moderation |
| `report.build` | HR, payroll operator, payroll approver | Custom report builder; salary columns additionally require payroll or compensation access |
