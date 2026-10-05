import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "info" | "danger";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span className={cn("badge", `badge--${tone}`)}>
      <span className="badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
