import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getChannelPreferences } from "@/lib/api/notifications/notifications.service";
import { getSession } from "@/lib/api/session/session.service";
import { SettingsSection } from "@/components/sections/account/account-sections";
import { PageSkeleton } from "@/components/ui/skeletons";
import { getLang } from "@/lib/i18n/server";
import { parseTheme } from "@/lib/utils/theme";

export const metadata: Metadata = { title: "Settings" };

async function Data() {
  const [session, jar, lang] = await Promise.all([getSession(), cookies(), getLang()]);
  if (!session) redirect("/login");
  return <SettingsSection session={session} theme={parseTheme(jar.get("gtf-theme")?.value)} notifications={await getChannelPreferences()} lang={lang} />;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading settings" variant="split" />}>
      <Data />
    </Suspense>
  );
}
