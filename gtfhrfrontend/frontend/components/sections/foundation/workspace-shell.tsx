import Link from "next/link";
import { WorkspaceFrame } from "@/components/features/foundation/workspace-frame";
import Image from "next/image";
import type { ReactNode } from "react";
import { ThemeControl } from "@/components/features/shell/theme-control";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import type { ThemePreference } from "@/types/foundation";

const navigation: {
  href: string;
  label: string;
  icon: IconName;
  number: string;
}[] = [
  { href: "#overview", label: "Overview", icon: "grid", number: "01" },
  { href: "#brand", label: "Brand & colors", icon: "palette", number: "02" },
  { href: "#typography", label: "Typography", icon: "text", number: "03" },
  { href: "#components", label: "Components", icon: "layers", number: "04" },
  {
    href: "#data-preview",
    label: "Data preview",
    icon: "people",
    number: "05",
  },
  { href: "#states", label: "Feedback & states", icon: "shield", number: "06" },
];
export function WorkspaceShell({
  children,
  theme,
}: {
  children: ReactNode;
  theme: ThemePreference;
}) {
  return (
    <WorkspaceFrame
      sidebar={
        <>
          <Link href="/foundation" className="brand">
            <Image
              src="/brand/gtf-logo.png"
              alt=""
              width={500}
              height={277}
              sizes="42px"
              className="brand-logo"
              priority
            />
            <span className="brand-text">
              gtf<span className="brand-hr">hr</span><span className="brand-dot">.</span>
              <small>PEOPLE. POSSIBILITY.</small>
            </span>
          </Link>
          <div className="workspace-label">
            <span className="workspace-letter">G</span>
            <div>
              <strong>GTF Technologies</strong>
              <span>HR workspace</span>
            </div>
            <span className="workspace-tag">DEMO</span>
          </div>
          <nav className="side-nav" aria-label="Foundation sections">
            <p className="eyebrow">FOUNDATION</p>
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
              >
                <AppIcon name={item.icon} />
                <span className="sidebar-label">{item.label}</span>
                <small>{item.number}</small>
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="phase-note">
              <span className="phase-mark">
                <AppIcon name="layers" size={20} />
              </span>
              <p>
                <strong>Built with intention.</strong>
                <span>
                  One shared foundation.
                  <br />
                  Every employee experience.
                </span>
              </p>
            </div>
            <div className="sidebar-footer">
              <span className="avatar avatar--neutral" aria-hidden="true">
                GT
              </span>
              <div>
                <strong>Foundation preview</strong>
                <span>FE1 · Synthetic data</span>
              </div>
            </div>
          </div>
        </>
      }
      toolbar={
        <div className="topbar-actions">
          <span className="preview-label">
            <span />
            Local preview
          </span>
          <ThemeControl initialTheme={theme} />
        </div>
      }
      footer={
        <>
          <span>Made for the people at GTF.</span>
          <span>
            Foundation v0.1 <span aria-hidden="true">·</span> FE1
          </span>
        </>
      }
    >
      {children}
    </WorkspaceFrame>
  );
}
