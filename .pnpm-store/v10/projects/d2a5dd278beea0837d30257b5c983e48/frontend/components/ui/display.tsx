import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  type DateStyle,
} from "@/lib/utils/format";
import type { Money, PersonRef, Tone } from "@/types/common";

/* Money & dates ------------------------------------------------------------ */

export function MoneyText({ value, compact = false, className }: { value: Money; compact?: boolean; className?: string }) {
  const exact = formatMoney(value);
  return (
    <data value={value.amount} className={cn("num", className)} title={compact ? exact : undefined}>
      {compact ? formatMoneyCompact(value) : exact}
      {compact && <span className="sr-only"> ({exact})</span>}
    </data>
  );
}

export function DateText({ value, style = "medium" }: { value: string; style?: DateStyle }) {
  return <time dateTime={value}>{formatDate(value, style)}</time>;
}

/* Status ------------------------------------------------------------------- */

export function StatusBadge({ status }: { status: { label: string; tone: Tone } }) {
  return <Badge tone={status.tone}>{status.label}</Badge>;
}

/* Person ------------------------------------------------------------------- */

export function PersonCell({
  person,
  href,
  meta,
}: {
  person: Pick<PersonRef, "id" | "name" | "initials" | "designation" | "photoUrl">;
  href?: string;
  meta?: ReactNode;
}) {
  const name = href ? (
    <Link href={href} className="person-link">
      {person.name}
    </Link>
  ) : (
    person.name
  );
  return (
    <span className="person">
      <Avatar initials={person.initials} seed={person.id} src={person.photoUrl} size="sm" />
      <span className="person-text">
        <span className="person-name">{name}</span>
        <span className="person-role">{meta ?? person.designation}</span>
      </span>
    </span>
  );
}

/* Key/value ---------------------------------------------------------------- */

export function KeyValueList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode; hint?: string }[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl className={cn("kv", `kv--${columns}`)}>
      {items.map((item) => (
        <div key={item.label} className="kv-row">
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.hint && <span className="kv-hint">{item.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* Alert -------------------------------------------------------------------- */

const alertIcons: Record<Tone, IconName> = {
  neutral: "info",
  info: "info",
  success: "check",
  warning: "warning",
  danger: "danger",
};
export function Alert({
  tone = "info",
  title,
  children,
  action,
  live = false,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  live?: boolean;
}) {
  return (
    <div className={cn("alert", `alert--${tone}`)} role={live ? (tone === "danger" ? "alert" : "status") : undefined}>
      <AppIcon name={alertIcons[tone]} size={20} />
      <div className="alert-body">
        {title && <p className="alert-title">{title}</p>}
        {children && <div className="alert-text">{children}</div>}
      </div>
      {action && <div className="alert-action">{action}</div>}
    </div>
  );
}

/* Meter -------------------------------------------------------------------- */

export function Meter({ value, max, label, tone = "primary" }: { value: number; max: number; label: string; tone?: "primary" | "secondary" | "warning" }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span className={cn("meter-fill", `meter-fill--${tone}`)} style={{ width: `${percent}%` }} />
    </div>
  );
}

/* Steps -------------------------------------------------------------------- */

export function StepIndicator({
  steps,
  current,
  label,
}: {
  steps: string[];
  /** Index of the current authoritative step. */
  current: number;
  label: string;
}) {
  return (
    <ol className="steps" aria-label={label} tabIndex={0}>
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={step} className="step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">
              {state === "done" ? <AppIcon name="check" size={16} /> : index + 1}
            </span>
            <span className="step-label">
              {step}
              <span className="sr-only">{state === "done" ? " (complete)" : state === "current" ? " (current)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* Timeline ----------------------------------------------------------------- */

export function Timeline({ items }: { items: { id: string; title: ReactNode; meta: ReactNode; detail?: ReactNode }[] }) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id} className="timeline-item">
          <span className="timeline-dot" aria-hidden="true" />
          <div>
            <p className="timeline-title">{item.title}</p>
            {item.detail && <p className="timeline-detail">{item.detail}</p>}
            <p className="timeline-meta">{item.meta}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* Tabs --------------------------------------------------------------------- */

export function TabsNav({ tabs, label }: { tabs: { href: string; label: string; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className="tab" aria-current={tab.active ? "page" : undefined} scroll={false}>
          {tab.label}
          {tab.count !== undefined && <span className="tab-count num">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/* List row ----------------------------------------------------------------- */

export function ListRow({
  leading,
  title,
  meta,
  trailing,
  href,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      {leading && <span className="list-leading">{leading}</span>}
      <span className="list-text">
        <span className="list-title">{title}</span>
        {meta && <span className="list-meta">{meta}</span>}
      </span>
      {trailing && <span className="list-trailing">{trailing}</span>}
      {href && <AppIcon name="chevronRight" size={16} className="list-chevron" />}
    </>
  );
  return (
    <li className="list-row">
      {href ? (
        <Link href={href} className="list-row-inner list-row-inner--link">
          {content}
        </Link>
      ) : (
        <div className="list-row-inner">{content}</div>
      )}
    </li>
  );
}

export function IconTile({ icon, accent = "neutral" }: { icon: IconName; accent?: "magenta" | "cyan" | "yellow" | "neutral" }) {
  return (
    <span className={cn("icon-tile", `avatar--${accent}`)}>
      <AppIcon name={icon} size={20} />
    </span>
  );
}
