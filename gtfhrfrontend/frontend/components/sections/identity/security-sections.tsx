import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, KeyValueList } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { MfaEnrollment, RemoveFactorButton } from "@/components/features/identity/mfa-controls";
import { signOutEverywhereAction } from "@/lib/actions/session";
import { SignOutForm } from "@/components/features/drafts/sign-out-form";
import { formatDateTime } from "@/lib/utils/format";
import { roleLabels, type SecurityOverview } from "@/types/identity";

export function SecuritySection({ overview, enroll }: { overview: SecurityOverview; enroll: boolean }) {
  const verified = overview.factors.filter((factor) => factor.status === "verified");
  const demo = overview.source === "mock";
  return (
    <div className="page">
      <PageHeader
        eyebrow="Settings"
        title="Sign-in & security"
        description="Your login ID, two-step verification and active sessions."
        back={{ href: "/settings", label: "Settings" }}
      />
      {demo && (
        <Alert tone="info" title="Demo mode">
          Demo profiles have no password or authenticator. These controls work when the app runs on the Supabase backend.
        </Alert>
      )}
      {overview.pendingRoles.length > 0 && (
        <Alert tone="warning" title="Some of your access is paused">
          {overview.pendingRoles.map((role) => roleLabels[role]).join(", ")} rights need a session verified with an authenticator app.{" "}
          {verified.length > 0 ? "Sign out and sign in again to verify with your code." : "Set one up below."}
        </Alert>
      )}
      <div className="split">
        <Card labelledBy="security-account">
          <CardHeader id="security-account" title="Account" />
          <CardBody>
            <KeyValueList
              items={[
                { label: "Login ID", value: overview.loginId },
                { label: "Last sign-in", value: overview.lastSignInAt ? formatDateTime(overview.lastSignInAt) : "—" },
                {
                  label: "This session",
                  value: overview.currentLevel === "aal2" ? <Badge tone="success">Verified with authenticator</Badge> : overview.currentLevel === "aal1" ? <Badge tone="neutral">Password only</Badge> : "—",
                },
                { label: "Two-step verification", value: overview.mfaEnforced ? "Required for HR and payroll roles" : "Optional in this environment" },
              ]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="security-sessions">
          <CardHeader id="security-sessions" title="Sessions" description="Signs you out on every device, including this one." />
          <CardBody>
            <SignOutForm action={signOutEverywhereAction}>
              <button type="submit" className="button button--secondary" disabled={demo}>
                <AppIcon name="logout" size={20} />
                Sign out everywhere
              </button>
            </SignOutForm>
          </CardBody>
        </Card>
      </div>
      <Card labelledBy="security-mfa">
        <CardHeader id="security-mfa" title="Authenticator app" description="A 6-digit code from your phone, in addition to your password." />
        <CardBody>
          {verified.length > 0 && (
            <ul className="list" aria-label="Authenticators">
              {verified.map((factor) => (
                <li key={factor.id} className="list-row">
                  <div className="list-row-inner">
                    <span className="list-leading">
                      <AppIcon name="shield" size={20} />
                    </span>
                    <span className="list-text">
                      <span className="list-title">{factor.friendlyName ?? "Authenticator app"}</span>
                      <span className="list-meta">Added {formatDateTime(factor.createdAt)}</span>
                    </span>
                    <span className="list-trailing">
                      <RemoveFactorButton factorId={factor.id} {...(overview.currentLevel !== "aal2" ? { disabledReason: "Sign in with your code first to remove it." } : {})} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!demo && verified.length === 0 && <MfaEnrollment highlight={enroll || overview.pendingRoles.length > 0} />}
          {!demo && verified.length > 0 && <p className="small muted">To replace your phone, add the new app after removing the old one.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
