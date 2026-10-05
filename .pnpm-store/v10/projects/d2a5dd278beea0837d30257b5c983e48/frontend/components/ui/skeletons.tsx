import { Skeleton } from "@/components/ui/skeleton";

/*
 * Layout-matched route skeletons. Each mirrors its section's grid so content
 * streams in without layout shift. One polite announcement per region.
 */

function Announce({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

export function HeaderSkeleton({ actions = true }: { actions?: boolean }) {
  return (
    <div className="page-header" aria-hidden="true">
      <div className="page-header-text">
        <Skeleton className="sk sk-eyebrow" />
        <Skeleton className="sk sk-h1" />
        <Skeleton className="sk sk-line sk-w-60" />
      </div>
      {actions && <Skeleton className="sk sk-button" />}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-stats" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="stat">
          <Skeleton className="sk sk-line sk-w-40" />
          <Skeleton className="sk sk-metric" />
          <Skeleton className="sk sk-line sk-w-60" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ rows = 3, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className="card" aria-hidden="true">
      <div className="card-header">
        <div className="sk-stack">
          <Skeleton className="sk sk-h2" />
          <Skeleton className="sk sk-line sk-w-50" />
        </div>
      </div>
      <div className="card-body sk-stack">
        {tall && <Skeleton className="sk sk-block" />}
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="sk-row">
            <Skeleton className="sk sk-avatar" />
            <div className="sk-stack sk-grow">
              <Skeleton className="sk sk-line sk-w-50" />
              <Skeleton className="sk sk-line sk-w-30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card" aria-hidden="true">
      <div className="card-body sk-toolbar">
        <Skeleton className="sk sk-input" />
        <Skeleton className="sk sk-input sk-input--sm" />
        <Skeleton className="sk sk-input sk-input--sm" />
      </div>
      <div className="sk-table">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="sk-row sk-table-row">
            <Skeleton className="sk sk-avatar" />
            <Skeleton className="sk sk-line sk-w-30" />
            <Skeleton className="sk sk-line sk-w-20 sk-optional" />
            <Skeleton className="sk sk-line sk-w-20 sk-optional" />
            <Skeleton className="sk sk-pill" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({
  label,
  variant,
}: {
  label: string;
  variant: "dashboard" | "table" | "split" | "detail" | "cards";
}) {
  return (
    <div className="page" role="status" aria-live="polite">
      <Announce label={label} />
      <HeaderSkeleton />
      {variant === "dashboard" && (
        <>
          <StatsSkeleton />
          <div className="grid grid-home">
            <CardSkeleton rows={2} tall />
            <CardSkeleton rows={3} />
          </div>
          <div className="grid grid-2">
            <CardSkeleton rows={3} />
            <CardSkeleton rows={3} />
          </div>
        </>
      )}
      {variant === "table" && <TableSkeleton />}
      {variant === "cards" && (
        <>
          <StatsSkeleton count={3} />
          <CardSkeleton rows={5} />
        </>
      )}
      {variant === "split" && (
        <div className="split">
          <CardSkeleton rows={6} />
          <CardSkeleton rows={4} tall />
        </div>
      )}
      {variant === "detail" && (
        <div className="split split--aside-left">
          <CardSkeleton rows={2} tall />
          <CardSkeleton rows={5} />
        </div>
      )}
    </div>
  );
}
