import type { ThemePreference } from "@/types/foundation";

export function parseTheme(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
