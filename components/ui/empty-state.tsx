import { AppIcon } from "@/components/ui/app-icon";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <AppIcon name="search" size={24} />
      </span>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
    </div>
  );
}
