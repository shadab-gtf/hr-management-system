import Link from "next/link";
import { AppIcon } from "@/components/ui/app-icon";
import { signOutAction } from "@/lib/actions/session";
import type { Session } from "@/types/session";

/**
 * Deny by default (BE-003): a signed-in account that nobody has granted a role yet. Shown instead of empty or
 * "access denied" pages, with what the administrator needs to find the account.
 */
export function NoAccessSection({ session }: { session: Session }) {
  return (
    <section className="error-state" aria-labelledby="no-access-title">
      <span className="empty-icon">
        <AppIcon name="lock" size={24} />
      </span>
      <h1 id="no-access-title">Access not granted yet</h1>
      <p>
        You’re signed in as <strong>{session.displayName}</strong>, but an
        administrator hasn’t given your account any access yet. Ask your HR team
        or administrator to grant the access you need.
      </p>
      <p className="small muted">
        Share your employee ID <strong>{session.employeeId}</strong>
        {session.department ? ` (${session.department})` : ""} so they can find
        your account. New access applies as soon as it is granted — check again
        after they confirm.
      </p>
      <div className="button-row">
        <Link
          className="button button--primary"
          href="/dashboard"
          prefetch={false}
        >
          <AppIcon name="refresh" size={16} />
          Check again
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="button button--secondary">
            Sign out
          </button>
        </form>
      </div>
    </section>
  );
}
