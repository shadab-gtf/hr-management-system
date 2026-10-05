import Link from "next/link";
import { ThemeControl } from "@/components/features/shell/theme-control";
import { InstallButton } from "@/components/features/pwa/install-prompt";
import { PermissionsPanel } from "@/components/features/pwa/permissions-panel";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, KeyValueList, ListRow } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { signOutAction } from "@/lib/actions/session";
import { SignOutForm } from "@/components/features/drafts/sign-out-form";
import { humanize } from "@/lib/utils/format";
import type { NavGroup } from "@/lib/navigation";
import type { Session } from "@/types/session";
import type { ThemePreference } from "@/types/foundation";
import { NotificationPreferencesForm, PhoneVerification } from "@/components/features/account/notification-preferences";
import { LanguageForm } from "@/components/features/account/language-form";
import { messages, navLabel, prefsStrings, topicLabels, type Lang } from "@/lib/i18n";
import type { ChannelPreferences } from "@/types/notifications";

function SignOut({ label = "Sign out" }: { label?: string }) {
  return (
    <SignOutForm action={signOutAction}>
      <button type="submit" className="button button--secondary sign-out">
        <AppIcon name="logout" size={20} />
        {label}
      </button>
    </SignOutForm>
  );
}

function ProfileRow({ session, viewProfile }: { session: Session; viewProfile: string }) {
  return (
    <Link href="/me/profile" className="more-profile list-row-inner--link">
      <Avatar initials={session.initials} seed={session.employeeId} src={session.photoUrl} size="lg" />
      <div>
        <strong>{session.displayName}</strong>
        <span className="muted small">
          {session.designation} · {viewProfile}
        </span>
      </div>
      <AppIcon name="chevronRight" size={16} className="list-chevron push-end" />
    </Link>
  );
}

/** Mobile "More" hub: every permitted destination, native settings-list style. */
export function MoreSection({ session, groups, lang = "en" }: { session: Session; groups: NavGroup[]; lang?: Lang }) {
  const t = messages(lang).more;
  return (
    <div className="page">
      <PageHeader title={t.title} />
      <Card>
        <ProfileRow session={session} viewProfile={t.viewProfile} />
      </Card>
      {groups.map((group) => (
        <Card key={group.label} labelledBy={`more-${group.label}`}>
          <CardHeader id={`more-${group.label}`} title={navLabel(lang, group.label)} />
          <ul className="list">
            {group.items.map((item) => (
              <ListRow
                key={item.href}
                href={item.href}
                leading={<span className="icon-tile avatar--neutral"><AppIcon name={item.icon} size={20} /></span>}
                title={navLabel(lang, item.label, item.href)}
                trailing={item.badge ? <span className="nav-badge num">{item.badge}</span> : undefined}
              />
            ))}
          </ul>
        </Card>
      ))}
      <Card>
        <ul className="list">
          <ListRow href="/notifications" leading={<span className="icon-tile avatar--neutral"><AppIcon name="notification" size={20} /></span>} title={t.notifications} trailing={session.unreadNotifications ? <span className="nav-badge num">{session.unreadNotifications}</span> : undefined} />
          <ListRow href="/settings" leading={<span className="icon-tile avatar--neutral"><AppIcon name="settings" size={20} /></span>} title={t.settings} />
        </ul>
      </Card>
      <SignOut label={t.signOut} />
    </div>
  );
}

export function SettingsSection({ session, theme, notifications, lang = "en" }: { session: Session; theme: ThemePreference; notifications: ChannelPreferences; lang?: Lang }) {
  const t = messages(lang).settings;
  const prefs = prefsStrings[lang];
  return (
    <div className="page">
      <PageHeader title={t.title} description={t.description} />
      <div className="split">
        <div className="stack">
          <Card labelledBy="appearance-heading">
            <CardHeader id="appearance-heading" title={t.appearance} description={t.appearanceHint} />
            <CardBody>
              <ThemeControl initialTheme={theme} />
            </CardBody>
          </Card>
          <Card labelledBy="language-heading">
            <CardHeader id="language-heading" title={t.language} description={t.languageHint} />
            <CardBody>
              <LanguageForm lang={lang} legend={t.language} submitLabel={t.saveLanguage} />
            </CardBody>
          </Card>
          <Card labelledBy="notif-heading">
            <CardHeader id="notif-heading" title={t.notifications} description={t.notificationsHint} />
            <CardBody className="stack">
              {!notifications.deliveryAvailable && <Alert tone="info">{t.notConnected}</Alert>}
              <PhoneVerification phone={notifications.phone} strings={prefs} />
              <NotificationPreferencesForm preferences={notifications} topicLabels={topicLabels[lang]} strings={prefs} />
            </CardBody>
          </Card>
          <Card labelledBy="account-heading">
            <CardHeader id="account-heading" title={t.account} />
            <CardBody>
              <KeyValueList
                items={[
                  { label: t.name, value: session.displayName },
                  { label: t.department, value: session.department },
                  { label: t.organization, value: session.organization.name },
                  { label: t.timezone, value: session.organization.timezone },
                  { label: t.roles, value: session.roles.map(humanize).join(", ") },
                ]}
              />
            </CardBody>
          </Card>
        </div>
        <div className="stack">
          <Card labelledBy="app-heading">
            <CardHeader id="app-heading" title={t.app} description={t.appHint} />
            <CardBody className="stack">
              <InstallButton />
            </CardBody>
          </Card>
          <Card labelledBy="perm-heading">
            <CardHeader id="perm-heading" title={t.permissions} description={t.permissionsHint} />
            <PermissionsPanel />
          </Card>
          <Card labelledBy="security-heading">
            <CardHeader id="security-heading" title={t.privacy} />
            <CardBody className="stack">
              <p className="text-block muted">{t.privacyText}</p>
              {session.source === "mock" && (
                <Alert tone="warning" title={t.demoTitle}>
                  {t.demoText}
                </Alert>
              )}
              <SignOut label={t.signOut} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
