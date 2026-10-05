"use client";

import Link from "next/link";
import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { activeChild, isActivePath, type NavEntry } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Sidebar entries with expandable groups. The group containing the current
 * route opens automatically; other groups remember the user's toggle.
 */
export function SidebarNav({
  entries,
  pathname,
  collapsed,
  onNavigate,
  label = "Sections",
  pendingLabel = "{n} pending",
}: {
  label?: string;
  pendingLabel?: string;
  entries: NavEntry[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  return (
    <nav className="app-nav" aria-label={label}>
      <ul>
        {entries.map((entry, index) => {
          const children = entry.children;
          if (!children) {
            const active = isActivePath(pathname, entry.href);
            return (
              <li key={entry.href}>
                <Link href={entry.href} className="nav-link" aria-current={active ? "page" : undefined} title={collapsed ? entry.label : undefined} onClick={onNavigate}>
                  <AppIcon name={entry.icon} variant={active ? "Bold" : "Linear"} />
                  <span className="nav-label">{entry.label}</span>
                  {entry.badge ? (
                    <span className="nav-badge num" aria-label={pendingLabel.replace("{n}", String(entry.badge))}>
                      {entry.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          }
          const current = activeChild(pathname, children);
          // Keyed by position, not label: translated (Devanagari) labels would collapse to one id.
          const open = toggled[index] ?? Boolean(current);
          const groupId = `nav-group-${index}`;
          if (collapsed)
            return (
              <li key={entry.href}>
                <Link href={entry.href} className="nav-link" aria-current={current ? "page" : undefined} title={entry.label} onClick={onNavigate}>
                  <AppIcon name={entry.icon} variant={current ? "Bold" : "Linear"} />
                  <span className="nav-label">{entry.label}</span>
                </Link>
              </li>
            );
          return (
            <li key={entry.href}>
              <button
                type="button"
                className={cn("nav-link nav-group-toggle", current && "nav-link--within")}
                aria-expanded={open}
                aria-controls={groupId}
                onClick={() => setToggled((state) => ({ ...state, [index]: !open }))}
              >
                <AppIcon name={entry.icon} variant={current ? "Bold" : "Linear"} />
                <span className="nav-label">{entry.label}</span>
                <AppIcon name="chevron" size={16} className={cn("nav-chevron", open && "nav-chevron--open")} />
              </button>
              <ul id={groupId} className="nav-sub" hidden={!open}>
                {children.map((child) => (
                  <li key={child.href}>
                    <Link href={child.href} className="nav-sublink" aria-current={current === child.href ? "page" : undefined} onClick={onNavigate}>
                      {child.label}
                      {child.badge ? <span className="nav-badge num">{child.badge}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
