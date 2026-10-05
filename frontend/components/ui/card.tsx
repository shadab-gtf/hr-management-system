import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({
  children,
  className,
  id,
  labelledBy,
  as: Element = "section",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Element id={id} aria-labelledby={labelledBy} className={cn("card", className)}>
      {children}
    </Element>
  );
}

export function CardHeader({
  title,
  description,
  action,
  id,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="card-header">
      <div>
        <h2 id={id}>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card-body", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card-footer", className)}>{children}</div>;
}
