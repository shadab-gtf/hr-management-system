import type { Metadata } from "next";
import { Suspense } from "react";
import { getNotifications } from "@/lib/api/notifications/notifications.service";
import { markNotificationsReadAction } from "@/lib/actions/notifications";
import { NotificationsSection } from "@/components/sections/notifications/notifications-section";
import { PageSkeleton } from "@/components/ui/skeletons";
import { getLang } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Notifications" };

async function NotificationsData() {
  const [notifications, lang] = await Promise.all([getNotifications(), getLang()]);
  return <NotificationsSection notifications={notifications} markRead={markNotificationsReadAction} lang={lang} />;
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading notifications" variant="cards" />}>
      <NotificationsData />
    </Suspense>
  );
}
