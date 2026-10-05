import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/ui/app-icon";

export function ErrorState({
  reset,
  title = "This view couldn’t load",
  homeHref = "/dashboard",
}: {
  reset: () => void;
  title?: string;
  homeHref?: string;
}) {
  return (
    <section className="error-state" role="alert">
      <span className="empty-icon">
        <AppIcon name="warning" size={24} />
      </span>
      <h1>{title}</h1>
      <p>Your information hasn’t changed. Try loading the view again.</p>
      <div className="button-row">
        <Button onClick={reset}>
          <AppIcon name="refresh" size={16} />
          Try again
        </Button>
        <Link className="button button--secondary" href={homeHref}>
          Go to home
        </Link>
      </div>
    </section>
  );
}

/** Safe generic denial: the page never serializes the protected content. */
export function AccessDenied({ what = "this page" }: { what?: string }) {
  return (
    <section className="error-state">
      <span className="empty-icon">
        <AppIcon name="lock" size={24} />
      </span>
      <h1>You don’t have access to {what}</h1>
      <p>If you need it for your work, ask HR or your manager to review your access.</p>
      <Link className="button button--secondary" href="/dashboard">
        Go to home
      </Link>
    </section>
  );
}
