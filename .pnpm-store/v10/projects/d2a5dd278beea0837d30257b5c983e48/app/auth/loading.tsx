import { Skeleton } from "@/components/ui/skeleton";

/** Matches the auth card layout (brand, title, fields, button). */
export default function Loading() {
  return (
    <main className="auth" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="auth-card">
        <div className="auth-brand">
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-copy" />
        </div>
        <Skeleton className="skeleton-block" />
        <Skeleton className="skeleton-block" />
        <Skeleton className="skeleton-label" />
      </div>
    </main>
  );
}
