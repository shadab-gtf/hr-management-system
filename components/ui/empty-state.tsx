import type { ReactNode } from "react";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { cn } from "@/lib/utils/cn";

export function EmptyState({
  title,
  description,
  icon = "search",
  action,
  compact = false,
}: {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("empty-state", compact && "empty-state--compact")}>
      <span className="empty-icon">
        <AppIcon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {action}
    </div>
  );
}
