"use client";

import { useState, useSyncExternalStore } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import type { ThemePreference } from "@/types/foundation";

const query = "(prefers-color-scheme: dark)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const systemDark = () => window.matchMedia(query).matches;

/**
 * One-tap light ↔ dark switch in the top bar. "System" resolves to the OS
 * setting until the first tap; Settings still offers System/Light/Dark.
 */
export function ThemeToggle({ initialTheme, toDark, toLight }: { initialTheme: ThemePreference; toDark: string; toLight: string }) {
  const [theme, setTheme] = useState(initialTheme);
  const osDark = useSyncExternalStore(subscribe, systemDark, () => false);
  const dark = theme === "dark" || (theme === "system" && osDark);
  const label = dark ? toLight : toDark;
  function toggle() {
    const next = dark ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    // Appearance only; same cookie the Settings control writes.
    document.cookie = `gtf-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  return (
    <button type="button" className="button button--ghost icon-button topbar-theme" aria-label={label} title={label} onClick={toggle}>
      <AppIcon name={dark ? "sun" : "moon"} />
    </button>
  );
}
