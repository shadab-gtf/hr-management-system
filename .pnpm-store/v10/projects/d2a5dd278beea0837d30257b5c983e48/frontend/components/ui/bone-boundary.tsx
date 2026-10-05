"use client";

import { Skeleton as BoneyardSkeleton } from "boneyard-js/react";
import type { ReactNode } from "react";
import "@/lib/bones/registry";

export function BoneBoundary({
  children,
  loading = false,
  fallback,
}: {
  children: ReactNode;
  loading?: boolean;
  fallback?: ReactNode;
}) {
  return (
    <div
      role={loading ? "status" : undefined}
      aria-label={loading ? "Loading foundation preview" : undefined}
    >
      <BoneyardSkeleton
        name="foundation"
        loading={loading}
        color="var(--skeleton)"
        darkColor="var(--skeleton)"
        animate="pulse"
        select="viewport"
        fallback={fallback}
        boneClass="gtf-bone"
      >
        {children}
      </BoneyardSkeleton>
    </div>
  );
}
