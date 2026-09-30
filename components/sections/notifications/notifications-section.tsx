import Link from "next/link";
import { AppIcon } from "@/components/ui/app-icon";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatRelative } from "@/lib/utils/format";
import { ButtonLink } from "@/components/ui/button";
import { fill, messages, type Lang } from "@/lib/i18n";

export function NotificationsSection({
  notifications,
  markRead,
  lang = "en",
}: {
  lang?: Lang;
  notifications: { id: string; title: string; body: string; href: string | null; createdAt: string; read: boolean }[];
  markRead: () => Promise<void>;
}) {
  const unread = notifications.filter((item) => !item.read).length;
  const t = messages(lang).notifications;
  return (
    <div className="page">
      <PageHeader
        title={t.title}
        description={unread ? fill(t.unread, { n: unread }) : t.caughtUp}
        actions={
          <>
            {unread ? (
              <form action={markRead}>
                <button type="submit" className="button button--secondary">
                  <AppIcon name="check" size={20} />
                  {t.markAll}
                </button>
              </form>
            ) : null}
            <ButtonLink href="/settings#notif-heading" variant="ghost">
              <AppIcon name="settings" size={20} />
              {t.manage}
            </ButtonLink>
          </>
        }
      />
      <Card>
        {notifications.length ? (
          <ul className="list">
            {notifications.map((item) => (
              <li key={item.id} className={item.read ? "list-row" : "list-row notification-unread"}>
                <Link href={item.href ?? "/dashboard"} className="list-row-inner list-row-inner--link">
                  <span className="list-text">
                    <span className="list-title">{item.title}</span>
                    <span className="list-meta">{item.body}</span>
                  </span>
                  <span className="list-trailing small muted">{formatRelative(item.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="notification" title={t.emptyTitle} description={t.emptyText} />
        )}
      </Card>
    </div>
  );
}
