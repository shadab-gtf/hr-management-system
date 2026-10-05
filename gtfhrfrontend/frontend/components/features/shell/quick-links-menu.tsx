"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { useDisclosure } from "@/hooks/use-disclosure";

/** Lightweight disclosure menu: Escape and outside click close it; focus returns. */
export function QuickLinksMenu({ links, label = "Quick links" }: { links: { href: string; label: string }[]; label?: string }) {
  const { open, toggle, hide } = useDisclosure();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, hide]);

  if (links.length === 0) return null;
  return (
    <div className="menu" ref={root}>
      <button ref={trigger} type="button" className="button button--ghost menu-trigger" aria-expanded={open} aria-haspopup="true" onClick={toggle}>
        {label}
        <AppIcon name="chevron" size={16} />
      </button>
      {open && (
        <ul className="menu-list" role="list">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="menu-item" onClick={hide}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
