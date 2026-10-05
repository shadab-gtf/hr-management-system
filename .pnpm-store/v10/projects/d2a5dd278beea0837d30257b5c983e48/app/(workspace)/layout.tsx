import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  getApprovals,
  getWorkQueue,
} from "@/lib/api/approvals/approvals.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { AppShell } from "@/components/sections/shell/app-shell";
import { InstallPrompt } from "@/components/features/pwa/install-prompt";
import { RealtimeClient } from "@/components/features/realtime/realtime-client";
import { apiConfig } from "@/lib/api/core/config";
import { ZeroAccessGate } from "@/components/features/identity/zero-access-gate";
import { NoAccessSection } from "@/components/sections/identity/no-access-section";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Badge counts inbox requests plus decisions waiting on module pages.
  const pending = hasCapability(session, "approval.decide")
    ? (await getApprovals("pending")).length +
      (await getWorkQueue()).reduce((sum, item) => sum + item.count, 0)
    : 0;
  return (
    <AppShell
      session={session}
      pendingApprovals={pending}
      extras={
        <>
          <InstallPrompt />
          <RealtimeClient enabled={apiConfig.mode === "live"} />
        </>
      }
    >
      <ZeroAccessGate
        noAccess={session.capabilities.length === 0}
        fallback={<NoAccessSection session={session} />}
      >
        {children}
      </ZeroAccessGate>
    </AppShell>
  );
}
