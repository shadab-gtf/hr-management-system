"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { parseTheme } from "@/lib/utils/theme";
import type { ThemePreference } from "@/types/foundation";

export function ThemeControl({
  initialTheme,
}: {
  initialTheme: ThemePreference;
}) {
  const [theme, setTheme] = useState(initialTheme);
  function changeTheme(value: string) {
    const preference = parseTheme(value);
    setTheme(preference);
    document.documentElement.dataset.theme = preference;
    // This cookie stores appearance only. System mode follows CSS media queries.
    document.cookie = `gtf-theme=${preference}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  return (
    <div className="theme-control">
      <AppIcon
        name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"}
        size={16}
      />
      <label className="sr-only" htmlFor="appearance">
        Appearance
      </label>
      <select
        id="appearance"
        value={theme}
        onChange={(event) => changeTheme(event.target.value)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
