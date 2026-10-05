"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { QuickLinksMenu } from "@/components/features/shell/quick-links-menu";
import { SidebarNav } from "@/components/features/shell/sidebar-nav";
import { LanguageSwitch } from "@/components/features/shell/language-switch";
import { ThemeToggle } from "@/components/features/shell/theme-toggle";
import type { ThemePreference } from "@/types/foundation";
import { fill, type Lang, type Messages } from "@/lib/i18n";
import { signOutAction } from "@/lib/actions/session";
import { isActivePath, type NavEntry, type NavItem } from "@/lib/navigation";
import { useDisclosure } from "@/hooks/use-disclosure";
import { cn } from "@/lib/utils/cn";

export interface FrameUser {
  id: string;
  name: string;
  initials: string;
  designation: string;
  photoUrl: string | null;
}

type ShellStrings = Messages["shell"];

interface AppFrameProps {
  lang: Lang;
  theme: ThemePreference;
  strings: ShellStrings;
  entries: NavEntry[];
  bottom: NavItem[];
  quickLinks: { href: string; label: string }[];
  user: FrameUser;
  unread: number;
  demo: boolean;
  /** Install prompt, permission banners and other shell-level extras. */
  extras?: ReactNode;
  children: ReactNode;
}

export function AppFrame({ lang, theme, strings, entries, bottom, quickLinks, user, unread, demo, extras, children }: AppFrameProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const drawer = useDisclosure();

  return (
    <div className="app" lang={lang} data-collapsed={collapsed || undefined}>
      <a className="skip-link" href="#main">
        {strings.skip}
      </a>
      <aside className="app-sidebar" aria-label={strings.mainNav}>
        <SidebarContent entries={entries} pathname={pathname} user={user} collapsed={collapsed} strings={strings} />
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="button button--ghost icon-button topbar-menu"
            aria-label={strings.openNav}
            aria-haspopup="dialog"
            aria-expanded={drawer.open}
            onClick={drawer.show}
          >
            <AppIcon name="menu" />
          </button>
          <button
            type="button"
            className="button button--ghost icon-button topbar-collapse"
            aria-label={collapsed ? strings.expand : strings.collapse}
            aria-pressed={collapsed}
            title={collapsed ? strings.expand : strings.collapse}
            onClick={() => setCollapsed((value) => !value)}
          >
            <AppIcon name="sidebar" />
          </button>
          <Link href="/dashboard" className="topbar-brand" aria-label={strings.home}>
            <Image src="/brand/gtf-logo.png" alt="" width={500} height={277} sizes="36px" className="topbar-logo" />
            <span>
              gtf<span className="brand-hr">hr.</span>
            </span>
          </Link>
          <Link href="/employees" className="topbar-search">
            <AppIcon name="search" size={16} />
            <span>{strings.searchPeople}</span>
          </Link>
          <div className="topbar-actions">
            {demo && (
              <span className="demo-pill" title={strings.demoTitle}>
                <span aria-hidden="true" />
                {strings.demo}
              </span>
            )}
            <span className="topbar-quick">
              <QuickLinksMenu links={quickLinks} label={strings.quickLinks} />
            </span>
            <ThemeToggle initialTheme={theme} toDark={strings.toDark} toLight={strings.toLight} />
            <span className="topbar-lang">
              <LanguageSwitch lang={lang} label={strings.switchTo} />
            </span>
            <Link
              href="/notifications"
              className="button button--ghost icon-button topbar-bell"
              aria-label={unread ? fill(strings.notificationsUnread, { n: unread }) : strings.notifications}
            >
              <AppIcon name="notification" />
              {unread > 0 && <span className="count-dot num">{unread > 9 ? "9+" : unread}</span>}
            </Link>
            <Link href="/me/profile" className="topbar-avatar" aria-label={strings.profile}>
              <Avatar initials={user.initials} seed={user.id} src={user.photoUrl} size="sm" />
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="app-content">
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label={strings.quickNav}>
        {bottom.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
              <AppIcon name={item.icon} size={24} variant={active ? "Bold" : "Linear"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Sheet open={drawer.open} onOpenChange={drawer.setOpen} title={strings.navigation} placement="left">
        <SidebarContent entries={entries} pathname={pathname} user={user} collapsed={false} onNavigate={drawer.hide} inDrawer strings={strings} />
      </Sheet>
      {extras}
    </div>
  );
}

function SidebarContent({
  entries,
  pathname,
  user,
  collapsed,
  onNavigate,
  inDrawer = false,
  strings,
}: {
  strings: ShellStrings;
  entries: NavEntry[];
  pathname: string;
  user: FrameUser;
  collapsed: boolean;
  onNavigate?: () => void;
  inDrawer?: boolean;
}) {
  return (
    <div className={cn("sidebar-content", inDrawer && "sidebar-content--drawer")}>
      {!inDrawer && (
        <Link href="/dashboard" className="app-brand" aria-label={strings.home}>
          <Image src="/brand/gtf-logo.png" alt="" width={500} height={277} sizes="40px" className="app-brand-logo" priority />
          <span className="app-brand-text">
            gtf<span className="brand-hr">hr.</span>
          </span>
        </Link>
      )}
      <Link href="/me/profile" className="sidebar-me " onClick={onNavigate} title={collapsed ? user.name : undefined}>
        <Avatar initials={user.initials} seed={user.id} src={user.photoUrl} size="md" />
        <span className="sidebar-user-text">
          <strong>{fill(strings.hi, { name: user.name.split(" ")[0] ?? user.name })}</strong>
          <span>{strings.viewInfo}</span>
        </span>
      </Link>
      <SidebarNav entries={entries} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} label={strings.sections} pendingLabel={strings.pending} />
      <div className="sidebar-foot">
        <Link href="/settings" className="nav-link" aria-current={pathname === "/settings" ? "page" : undefined} onClick={onNavigate} title={collapsed ? strings.settings : undefined}>
          <AppIcon name="settings" />
          <span className="nav-label">{strings.settings}</span>
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="nav-link nav-signout" title={collapsed ? strings.signOut : undefined}>
            <AppIcon name="logout" />
            <span className="nav-label">{strings.signOut}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
