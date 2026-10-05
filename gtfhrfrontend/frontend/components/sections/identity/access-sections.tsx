import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, PersonCell } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  AccountStateSheet,
  CopyInviteLinkButton,
  GrantRoleSheet,
  InviteAccountButton,
  RevokeRoleSheet,
  type GrantOption,
} from "@/components/features/identity/access-controls";
import { formatDate, formatDateTime, initialsOf } from "@/lib/utils/format";
import {
  privilegedRoles,
  roleLabels,
  scopableRoles,
  type AccessOverview,
  type AccountStatus,
  type AuditPage,
  type IdentityAccount,
  type MailOutboxItem,
  type MailStatus,
  type RoleGrant,
} from "@/types/identity";
import type { Role } from "@/types/session";

const statusBadge: Record<AccountStatus, { label: string; tone: BadgeTone }> = {
  not_invited: { label: "Not invited", tone: "neutral" },
  invited: { label: "Invited", tone: "info" },
  active: { label: "Active", tone: "success" },
  disabled: { label: "Disabled", tone: "danger" },
};

const mailBadge: Record<MailStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: "Queued", tone: "info" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  not_configured: { label: "Not sent — mail off", tone: "warning" },
  copied: { label: "Link copied by HR", tone: "neutral" },
};

const templateLabels: Record<MailOutboxItem["template"], string> = {
  invite: "Welcome invite",
  recovery: "Password reset",
  password_changed: "Password changed",
  mfa_changed: "MFA changed",
  access_changed: "Access changed",
};

const isPrivileged = (role: Role) =>
  (privilegedRoles as readonly Role[]).includes(role);
const isScopable = (role: Role) =>
  (scopableRoles as readonly Role[]).includes(role);
type Grantable = AccessOverview["viewer"]["grantable"][number];

/** "Engineering, Design" / "org-wide" for HR and payroll roles; self and team roles describe their reach. */
export function scopeLabel(grant: RoleGrant): string {
  if (grant.role === "employee") return "own records";
  if (grant.role === "manager") return "own team";
  if (grant.role === "super_admin" || grant.departments.length === 0)
    return "org-wide";
  return grant.departments.map((department) => department.name).join(", ");
}

function RoleList({ account }: { account: IdentityAccount }) {
  if (account.roles.length === 0) return <Badge tone="danger">No access</Badge>;
  return (
    <span className="chip-row">
      {account.roles.map((grant) => (
        <Badge
          key={grant.role}
          tone={
            grant.role === "super_admin"
              ? "danger"
              : isPrivileged(grant.role)
                ? "warning"
                : "neutral"
          }
        >
          {roleLabels[grant.role]}
          {isScopable(grant.role) || grant.role === "super_admin"
            ? ` · ${scopeLabel(grant)}`
            : ""}
          {grant.expiresAt
            ? ` · until ${formatDate(grant.expiresAt.slice(0, 10), "short")}`
            : ""}
        </Badge>
      ))}
    </span>
  );
}

/** Whether the viewer may revoke (or replace) this exact grant: the role is grantable to them, at least as wide. */
function mayChange(grantable: Grantable[], grant: RoleGrant): boolean {
  const allowed = grantable.find((item) => item.role === grant.role);
  if (!allowed) return false;
  if (allowed.scope === "all") return true;
  const scope = allowed.scope;
  return (
    grant.departments.length > 0 &&
    grant.departments.every((department) => scope.includes(department.id))
  );
}

function grantOptions(
  overview: AccessOverview,
  account: IdentityAccount,
): GrantOption[] {
  return overview.viewer.grantable.flatMap((allowed) => {
    const current = account.roles.find((grant) => grant.role === allowed.role);
    // Re-granting replaces departments/expiry: offered for HR and payroll roles the viewer could also revoke.
    if (
      current &&
      (!isScopable(current.role) ||
        !mayChange(overview.viewer.grantable, current))
    )
      return [];
    const scope = allowed.scope;
    return [
      {
        role: allowed.role,
        departments:
          scope === "all"
            ? overview.departments
            : overview.departments.filter((department) =>
                scope.includes(department.id),
              ),
        orgWideAllowed: scope === "all",
        held: Boolean(current),
        currentDepartmentIds:
          current?.departments.map((department) => department.id) ?? [],
      },
    ];
  });
}

function AccountActions({
  account,
  overview,
  today,
}: {
  account: IdentityAccount;
  overview: AccessOverview;
  today: string;
}) {
  // Nobody changes their own access; another administrator must.
  if (account.employeeId === overview.viewer.employeeId)
    return <span className="small muted">Your account</span>;
  const exited = account.employmentStatus === "exited";
  const grantable = overview.viewer.grantable;
  const revocable = account.roles.filter((grant) =>
    mayChange(grantable, grant),
  );
  // Disabling switches off every role, so it needs the right to remove each one (and super admin rights for a super admin).
  const mayDisable = account.roles.every((grant) =>
    mayChange(grantable, grant),
  );
  const live = overview.source === "database";
  const actions: ReactNode[] = [];
  if (
    live &&
    !exited &&
    (account.status === "not_invited" || account.status === "invited")
  )
    actions.push(
      <InviteAccountButton
        key="invite"
        employeeId={account.employeeId}
        resend={account.status === "invited"}
      />,
    );
  if (live && account.canCopyInvite && overview.adminReady)
    actions.push(
      <CopyInviteLinkButton
        key="copy"
        employeeId={account.employeeId}
        name={account.name}
      />,
    );
  if (!exited)
    actions.push(
      <GrantRoleSheet
        key="grant"
        employeeId={account.employeeId}
        name={account.name}
        options={grantOptions(overview, account)}
        today={today}
      />,
    );
  for (const grant of revocable)
    actions.push(
      <RevokeRoleSheet
        key={`revoke-${grant.role}`}
        employeeId={account.employeeId}
        name={account.name}
        role={grant.role}
        scopeLabel={scopeLabel(grant)}
      />,
    );
  if (account.status !== "not_invited" && !exited && mayDisable)
    actions.push(
      <AccountStateSheet
        key="state"
        employeeId={account.employeeId}
        name={account.name}
        disabled={account.status === "disabled"}
      />,
    );
  if (actions.length === 0)
    return <span className="small muted">No changes available to you</span>;
  return <span className="row-actions">{actions}</span>;
}

function grantableSummary(overview: AccessOverview): string {
  if (overview.viewer.isSuperAdmin)
    return "You are a super admin: you can grant every role, organization-wide.";
  const parts = overview.viewer.grantable.map((item) => {
    const scope = item.scope;
    const where =
      scope === "all"
        ? isScopable(item.role)
          ? "org-wide"
          : ""
        : overview.departments
            .filter((department) => scope.includes(department.id))
            .map((department) => department.name)
            .join(", ");
    return where
      ? `${roleLabels[item.role]} (${where})`
      : roleLabels[item.role];
  });
  return parts.length > 0
    ? `You can grant: ${parts.join(" · ")}.`
    : "You can view accounts but not grant roles.";
}
function MfaCell({ account }: { account: IdentityAccount }) {
  if (account.mfa === "enrolled") return <Badge tone="success">On</Badge>;
  if (account.mfa === "unknown") return <span className="muted">Unknown</span>;
  return account.mfaRequired && account.status !== "not_invited" ? (
    <Badge tone="warning">Required · off</Badge>
  ) : (
    <span className="muted">Off</span>
  );
}

export function AccessAdminSection({
  overview,
  today,
  tabs,
  canReadAudit = true,
}: {
  overview: AccessOverview;
  today: string;
  tabs?: ReactNode;
  canReadAudit?: boolean;
}) {
  const counts = overview.accounts.reduce(
    (acc, account) => ({ ...acc, [account.status]: acc[account.status] + 1 }),
    { not_invited: 0, invited: 0, active: 0, disabled: 0 } as Record<
      AccountStatus,
      number
    >,
  );
  const mfaGaps = overview.accounts.filter(
    (account) =>
      account.mfaRequired &&
      account.mfa !== "enrolled" &&
      account.status === "active",
  ).length;
  return (
    <div className="page">
      <PageHeader
        eyebrow="HR admin"
        title="Access & accounts"
        description="Nobody has access until it is granted here. Roles apply on the person’s next page load; HR and payroll roles can be limited to departments. People choose their own password from a single-use link — HR never sees it."
        actions={
          canReadAudit ? (
            <Link href="/admin/audit" className="button button--secondary">
              <AppIcon name="clipboard" size={20} />
              Audit log
            </Link>
          ) : undefined
        }
      />
      {tabs}
      {overview.source === "mock" && (
        <Alert tone="info" title="Demo mode">
          Synthetic people. Granting and removing roles follows the same rules
          as the live service and applies to the demo profiles straight away;
          invitations, passwords and MFA need a connected HR service.
        </Alert>
      )}
      <Alert
        tone={overview.viewer.isSuperAdmin ? "warning" : "info"}
        title={overview.viewer.isSuperAdmin ? "Super admin" : "Your access"}
      >
        {grantableSummary(overview)} You can’t change your own access — another
        administrator must.
      </Alert>
      {overview.source === "database" && !overview.adminReady && (
        <Alert tone="warning" title="Account service not configured">
          The HR service can’t manage sign-in accounts yet, so invites,
          disabling and MFA status return “service unavailable”. Ask your system
          administrator to finish the account service setup.
        </Alert>
      )}
      {overview.source === "database" && !overview.mailReady && (
        <Alert tone="info" title="Mail delivery is off">
          Outgoing mail isn’t configured, so invites are recorded in the outbox
          below but not sent. Use “Copy invite link” to hand a fresh single-use
          link to the person directly.
        </Alert>
      )}
      {overview.mfaEnforced && mfaGaps > 0 && (
        <Alert
          tone="warning"
          title={`${mfaGaps} privileged ${mfaGaps === 1 ? "person has" : "people have"} no MFA`}
        >
          Their HR and payroll rights stay inactive until they add an
          authenticator in Settings → Security.
        </Alert>
      )}
      <div className="grid grid-stats">
        <StatCard
          label="Active"
          value={counts.active}
          icon="userTick"
          accent="cyan"
        />
        <StatCard
          label="Invited"
          value={counts.invited}
          icon="mail"
          accent="yellow"
        />
        <StatCard
          label="Not invited"
          value={counts.not_invited}
          icon="userAdd"
        />
        <StatCard
          label="Disabled"
          value={counts.disabled}
          icon="userRemove"
          accent="magenta"
        />
      </div>
      <Card labelledBy="access-accounts">
        <CardHeader
          id="access-accounts"
          title="Accounts"
          description={`${overview.accounts.length} people you manage · login ID is the work email`}
        />
        <CardBody className="flush">
          <DataTable
            caption="Employee sign-in accounts"
            rows={overview.accounts}
            rowKey={(row) => row.employeeId}
            empty={
              <EmptyState
                compact
                icon="people"
                title="No employees"
                description="Accounts appear once employees are added."
              />
            }
            columns={[
              {
                key: "person",
                header: "Person",
                rowHeader: true,
                cell: (row) => (
                  <span className="stack-tight">
                    <PersonCell
                      person={{
                        id: row.employeeId,
                        name: row.name,
                        initials: initialsOf(row.name),
                        designation: row.designation,
                        photoUrl: null,
                      }}
                      meta={`${row.email} · ${row.department}`}
                    />
                    {row.roles.some(
                      (grant) => grant.role === "super_admin",
                    ) && (
                      <span className="cluster small">
                        <AppIcon name="shield" size={16} />
                        <strong>Super admin</strong>
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Account",
                cell: (row) => (
                  <span className="stack-tight">
                    <Badge tone={statusBadge[row.status].tone}>
                      {statusBadge[row.status].label}
                    </Badge>
                    {row.employmentStatus === "exited" && (
                      <span className="small muted">Exited</span>
                    )}
                  </span>
                ),
              },
              {
                key: "roles",
                header: "Roles",
                cell: (row) => <RoleList account={row} />,
              },
              {
                key: "signin",
                header: "Last sign-in",
                hideOnMobile: true,
                cell: (row) =>
                  row.lastSignInAt ? (
                    formatDateTime(row.lastSignInAt)
                  ) : (
                    <span className="muted">Never</span>
                  ),
              },
              {
                key: "mfa",
                header: "MFA",
                cell: (row) => <MfaCell account={row} />,
              },
              {
                key: "actions",
                header: "Actions",
                align: "end",
                cell: (row) => (
                  <AccountActions
                    account={row}
                    overview={overview}
                    today={today}
                  />
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
      <OutboxCard items={overview.outbox} />
    </div>
  );
}

function OutboxCard({ items }: { items: MailOutboxItem[] }) {
  return (
    <Card labelledBy="access-outbox">
      <CardHeader
        id="access-outbox"
        title="Mail outbox"
        description="Latest 50 messages. Links and tokens are never stored — bodies are shown redacted."
      />
      <CardBody className="flush">
        <DataTable
          caption="Mail outbox"
          rows={items}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              compact
              icon="mail"
              title="No mail yet"
              description="Invites and security notices appear here."
            />
          }
          columns={[
            {
              key: "when",
              header: "Created",
              rowHeader: true,
              cell: (row) => formatDateTime(row.createdAt),
            },
            {
              key: "to",
              header: "To",
              cell: (row) => (
                <span className="stack-tight">
                  <span>{row.to}</span>
                  <span className="small muted">
                    {templateLabels[row.template]}
                  </span>
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (row) => (
                <span className="stack-tight">
                  <Badge tone={mailBadge[row.status].tone}>
                    {mailBadge[row.status].label}
                  </Badge>
                  {row.error && (
                    <span className="small text-danger">{row.error}</span>
                  )}
                  {row.linkUsedAt && (
                    <span className="small muted">
                      Link used {formatDateTime(row.linkUsedAt)}
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: "body",
              header: "Message",
              hideOnMobile: true,
              cell: (row) => (
                <details>
                  <summary>{row.subject}</summary>
                  <pre className="small" style={{ whiteSpace: "pre-wrap" }}>
                    {row.bodyRedacted}
                  </pre>
                </details>
              ),
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}

/* Audit log ------------------------------------------------------------------------ */

export function AuditLogSection({
  page,
  filters,
  tabs,
}: {
  page: AuditPage;
  filters: { actor?: string; entity?: string; from?: string; to?: string };
  tabs?: ReactNode;
}) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const href = (target: number) => {
    const query = new URLSearchParams(
      Object.entries({ ...filters, page: String(target) }).filter(
        (entry): entry is [string, string] => Boolean(entry[1]),
      ),
    );
    return `/admin/audit?${query.toString()}`;
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="HR admin"
        title="Audit log"
        description="Read-only record of sign-ins, access changes and business actions. Entries can’t be edited or deleted."
        back={{ href: "/admin/access", label: "Access & accounts" }}
      />
      {tabs}
      {page.source === "mock" && (
        <Alert tone="info" title="Demo mode">
          Demo activity is not audited. A connected HR service provides the
          organization’s audit log.
        </Alert>
      )}
      <form
        className="toolbar"
        action="/admin/audit"
        method="get"
        role="search"
        aria-label="Filter audit log"
      >
        <div className="toolbar-field">
          <label htmlFor="audit-actor">Actor</label>
          <select
            id="audit-actor"
            name="actor"
            className="input select"
            defaultValue={filters.actor ?? ""}
          >
            <option value="">Anyone</option>
            {page.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-field">
          <label htmlFor="audit-entity">Entity</label>
          <select
            id="audit-entity"
            name="entity"
            className="input select"
            defaultValue={filters.entity ?? ""}
          >
            <option value="">All</option>
            {page.entities.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-field">
          <label htmlFor="audit-from">From</label>
          <input
            id="audit-from"
            className="input"
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </div>
        <div className="toolbar-field">
          <label htmlFor="audit-to">To</label>
          <input
            id="audit-to"
            className="input"
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </div>
        <div className="toolbar-actions">
          <button type="submit" className="button button--secondary">
            <AppIcon name="filter" size={20} />
            Apply
          </button>
          <Link href="/admin/audit" className="button button--ghost">
            Clear
          </Link>
        </div>
      </form>
      <Card labelledBy="audit-entries">
        <CardHeader
          id="audit-entries"
          title="Entries"
          description={`${page.total} matching · page ${page.page} of ${pages} · times in IST`}
        />
        <CardBody className="flush">
          <DataTable
            caption="Audit entries"
            rows={page.items}
            rowKey={(row) => row.id}
            empty={
              <EmptyState
                compact
                icon="clipboard"
                title="No entries"
                description="Nothing matches these filters."
              />
            }
            columns={[
              {
                key: "at",
                header: "When",
                rowHeader: true,
                cell: (row) => (
                  <span className="nowrap">{formatDateTime(row.at)}</span>
                ),
              },
              {
                key: "actor",
                header: "Actor",
                cell: (row) =>
                  row.actor?.name ?? (
                    <span className="muted">System / anonymous</span>
                  ),
              },
              {
                key: "action",
                header: "Action",
                cell: (row) => <code>{row.action}</code>,
              },
              {
                key: "entity",
                header: "Entity",
                cell: (row) => (
                  <span className="stack-tight">
                    <span>{row.entity}</span>
                    {row.entityId && (
                      <span className="small muted">{row.entityId}</span>
                    )}
                  </span>
                ),
              },
              {
                key: "details",
                header: "Details",
                hideOnMobile: true,
                cell: (row) => (
                  <code className="small" style={{ wordBreak: "break-word" }}>
                    {row.details}
                  </code>
                ),
              },
            ]}
          />
          {pages > 1 && (
            <nav className="pager" aria-label="Pagination">
              {page.page > 1 ? (
                <Link
                  href={href(page.page - 1)}
                  className="button button--secondary button--sm"
                >
                  <AppIcon name="back" size={16} />
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="small muted">
                Page {page.page} of {pages}
              </span>
              {page.page < pages ? (
                <Link
                  href={href(page.page + 1)}
                  className="button button--secondary button--sm"
                >
                  Older
                  <AppIcon name="chevronRight" size={16} />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
