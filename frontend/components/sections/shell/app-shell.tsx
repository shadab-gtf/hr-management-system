import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { parseTheme } from "@/lib/utils/theme";
import { AppFrame } from "@/components/features/shell/app-frame";
import { bottomNavigationFor, navigationFor, quickLinksFor } from "@/lib/navigation";
import { messages, translateNav } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import type { Session } from "@/types/session";

export async function AppShell({
  session,
  pendingApprovals,
  extras,
  children,
}: {
  session: Session;
  pendingApprovals: number;
  extras?: ReactNode;
  children: ReactNode;
}) {
  const lang = await getLang();
  const theme = parseTheme((await cookies()).get("gtf-theme")?.value);
  return (
    <AppFrame
      lang={lang}
      theme={theme}
      strings={messages(lang).shell}
      entries={translateNav(lang, navigationFor(session.capabilities, { "/approvals": pendingApprovals }))}
      bottom={translateNav(lang, bottomNavigationFor(session.capabilities))}
      quickLinks={translateNav(lang, quickLinksFor(session.capabilities))}
      user={{
        id: session.employeeId,
        name: session.displayName,
        initials: session.initials,
        designation: session.designation,
        photoUrl: session.photoUrl,
      }}
      unread={session.unreadNotifications}
      demo={session.source === "mock"}
      extras={extras}
    >
      {children}
    </AppFrame>
  );
}
