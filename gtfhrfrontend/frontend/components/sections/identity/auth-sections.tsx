import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Alert } from "@/components/ui/display";
import { ForgotPasswordForm, SetPasswordForm } from "@/components/features/identity/password-forms";
import { MfaChallengeForm } from "@/components/features/identity/mfa-controls";

function AuthShell({ title, lead, children, foot }: { title: string; lead: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <Image src="/brand/gtf-logo.png" alt="GTF Technologies" width={500} height={277} sizes="120px" className="auth-logo" priority />
          <h1>{title}</h1>
          <p className="muted">{lead}</p>
        </div>
        {children}
        <p className="auth-foot">
          <AppIcon name="shield" size={16} />
          {foot ?? "GTF never emails passwords and HR can’t see yours."}
        </p>
      </div>
    </main>
  );
}

const demoNote = (
  <Alert tone="info" title="Demo mode">
    Demo profiles have no passwords. Password setup, recovery and MFA work when the app runs on the Supabase backend.
  </Alert>
);

export type SetPasswordView =
  | { kind: "form"; tokenHash: string; type: "invite" | "recovery"; reference: string; loginId: string | null; min: number; max: number }
  | { kind: "done" }
  | { kind: "invalid" }
  | { kind: "demo" };

export function SetPasswordSection({ view }: { view: SetPasswordView }) {
  if (view.kind === "done")
    return (
      <AuthShell title="Password saved" lead="You were signed out everywhere. Sign in with your login ID and new password.">
        <Link href="/login" className="button button--primary auth-submit">
          <AppIcon name="login" size={20} />
          Sign in
        </Link>
      </AuthShell>
    );
  if (view.kind === "demo") return <AuthShell title="Set your password" lead="Choose the password for your GTF HR account.">{demoNote}</AuthShell>;
  if (view.kind === "invalid")
    return (
      <AuthShell title="This link can’t be used" lead="Set-password links work once and expire quickly.">
        <Alert tone="warning">It may have expired, been replaced by a newer link, or already been used. Ask for a new one below, or ask HR to resend your invite.</Alert>
        <Link href="/auth/forgot-password" className="button button--primary auth-submit">
          <AppIcon name="send" size={20} />
          Get a new link
        </Link>
      </AuthShell>
    );
  return (
    <AuthShell title="Choose your password" lead={view.loginId ? `For login ID ${view.loginId}` : "For your GTF HR account"}>
      <SetPasswordForm tokenHash={view.tokenHash} type={view.type} reference={view.reference} loginId={view.loginId} min={view.min} max={view.max} />
    </AuthShell>
  );
}

export function ForgotPasswordSection({ available, minutes }: { available: boolean; minutes: number }) {
  return (
    <AuthShell title="Reset your password" lead={`We’ll email a single-use link to your work email. It expires in ${minutes} minutes.`}>
      {available ? <ForgotPasswordForm /> : demoNote}
      <Link href="/login" className="inline-link">
        Back to sign in
      </Link>
    </AuthShell>
  );
}

export function MfaChallengeSection({ next, available }: { next: string; available: boolean }) {
  return (
    <AuthShell title="Verify it’s you" lead="Enter the code from your authenticator app to finish signing in." foot="Codes are checked by the sign-in service; they are never stored by GTF HR.">
      {available ? <MfaChallengeForm next={next} /> : demoNote}
      <Link href="/dashboard" className="inline-link">
        Skip for now (HR and payroll rights stay off)
      </Link>
    </AuthShell>
  );
}
