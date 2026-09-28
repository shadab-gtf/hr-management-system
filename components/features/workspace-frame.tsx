"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { animate, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/ui/app-icon";

const mobileQuery = "(max-width: 900px)";
function subscribeToViewport(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getMobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const getServerSnapshot = () => false;

interface WorkspaceFrameProps {
  sidebar: ReactNode;
  toolbar: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

export function WorkspaceFrame({
  sidebar,
  toolbar,
  footer,
  children,
}: WorkspaceFrameProps) {
  const [collapsed, setCollapsed] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const animation = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => animation.current?.stop(), []);
  const mobile = useSyncExternalStore(
    subscribeToViewport,
    getMobileSnapshot,
    getServerSnapshot,
  );
  const reducedMotion = useReducedMotion();
  function toggleSidebar() {
    const element = frame.current;
    const next = !collapsed;
    setCollapsed(next);
    if (!element) return;
    animation.current?.stop();
    const target = next ? 0 : 1;
    if (reducedMotion) {
      element.style.setProperty("--sidebar-expanded", String(target));
      return;
    }
    const current = Number(
      getComputedStyle(element).getPropertyValue("--sidebar-expanded"),
    );
    // Animate only after interaction, keeping the initial server render idle.
    animation.current = animate(current, target, {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) =>
        element.style.setProperty("--sidebar-expanded", String(value)),
    });
  }

  return (
    <div ref={frame} className="workspace" data-collapsed={collapsed}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside
        id="workspace-sidebar"
        className="sidebar"
        aria-label="Workspace navigation"
        inert={mobile && collapsed ? true : undefined}
      >
        <div className="sidebar-inner">{sidebar}</div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-start">
            <Button
              variant="ghost"
              className="icon-button sidebar-toggle"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-controls="workspace-sidebar"
              aria-expanded={!collapsed}
              onClick={toggleSidebar}
            >
              <AppIcon name="sidebar" />
            </Button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>Foundation</strong>
            </div>
          </div>
          {toolbar}
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="page-footer">{footer}</footer>
      </div>
    </div>
  );
}
