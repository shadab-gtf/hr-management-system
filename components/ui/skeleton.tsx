import { cn } from "@/lib/utils/cn";
import { BoneBoundary } from "@/components/ui/bone-boundary";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("skeleton", className)} />;
}
export function FoundationSkeleton() {
  return (
    <BoneBoundary loading fallback={<FoundationFallback />}>
      {null}
    </BoneBoundary>
  );
}
function FoundationFallback() {
  return (
    <div
      className="foundation-content"
      role="status"
      aria-label="Loading foundation preview"
    >
      <span className="sr-only">Loading foundation preview</span>
      <div className="intro">
        <Skeleton className="skeleton-label" />
        <Skeleton className="skeleton-title" />
        <Skeleton className="skeleton-copy" />
      </div>
      <div className="summary-grid">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="card skeleton-stat">
            <Skeleton className="skeleton-label" />
            <Skeleton className="skeleton-title" />
          </div>
        ))}
      </div>
      <div className="preview-grid">
        <div className="card skeleton-panel">
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-block" />
        </div>
        <div className="card skeleton-panel">
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-block" />
        </div>
      </div>
      <div className="card skeleton-panel">
        <Skeleton className="skeleton-title" />
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="skeleton-row" />
        ))}
      </div>
    </div>
  );
}
