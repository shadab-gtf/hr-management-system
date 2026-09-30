import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { cn } from "@/lib/utils/cn";

export function StatCard({
  label,
  value,
  meta,
  icon,
  accent = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  icon?: IconName;
  accent?: "magenta" | "cyan" | "yellow" | "neutral";
  href?: string;
}) {
  const body = (
    <>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && (
          <span className={cn("stat-icon", `avatar--${accent}`)}>
            <AppIcon name={icon} size={16} />
          </span>
        )}
      </div>
      <p className="stat-value num">{value}</p>
      {meta && <p className="stat-meta">{meta}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="stat stat--link">
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}
