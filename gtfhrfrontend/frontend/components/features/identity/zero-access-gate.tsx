"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Routes an account without any granted role may still use: its own settings, security and notifications. */
const OPEN_TO_EVERYONE = ["/settings", "/notifications"];

/**
 * Deny by default (BE-003): an account with no granted role sees the "access not granted yet" screen everywhere
 * except its own settings and notifications. The backend enforces the same rule; this only shapes the UI.
 */
export function ZeroAccessGate({
  noAccess,
  fallback,
  children,
}: {
  noAccess: boolean;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const open = OPEN_TO_EVERYONE.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return <>{noAccess && !open ? fallback : children}</>;
}
