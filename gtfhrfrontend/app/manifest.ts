import type { MetadataRoute } from "next";

/**
 * Installable app manifest. The OS reads these colours for the splash screen
 * and title bar before any CSS loads, so they are the only literal colours in
 * the app — kept equal to the `--panel` / `--primary` light tokens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "GTF HR",
    short_name: "GTF HR",
    description: "Attendance, leave, pay and requests for GTF Technologies.",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#b51e70",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Check in", url: "/attendance?source=shortcut", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96" }] },
      { name: "Apply leave", url: "/leave?new=1", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96" }] },
      { name: "Payslips", url: "/me/payslips", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96" }] },
    ],
  };
}
