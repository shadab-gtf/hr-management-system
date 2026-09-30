import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { AccessDenied } from "@/components/ui/error-state";
import { adminCapabilities } from "@/lib/navigation";

/** HR admin area: any one admin capability grants the area; each page checks its own. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasCapability(session, ...adminCapabilities)) return <AccessDenied what="HR admin" />;
  return children;
}
