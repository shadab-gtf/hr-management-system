import type { Metadata, Viewport } from "next";
import { Noto_Sans_Devanagari } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { parseTheme } from "@/lib/utils/theme";
import { getLang } from "@/lib/i18n/server";
import { AppProviders } from "@/components/features/shell/app-providers";
import { PwaProvider } from "@/components/features/pwa/pwa-provider";
import "./globals.css";
import "./styles/app.css";
import "./styles/modules.css";
import "./styles/statutory.css";
import "./styles/time.css";
import "./styles/lifecycle.css";
import "./styles/performance.css";
import "./styles/recruitment.css";
import "./styles/engage-plus.css";
import "./styles/timesheets.css";
import "./styles/reports.css";

const googleSans = localFont({
  src: "./fonts/google-sans-latin.woff2",
  variable: "--font-google-sans",
  weight: "400 700",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

// Hindi glyphs (Google Sans has none). Self-hosted at build, loaded only when Devanagari renders.
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600"],
  variable: "--font-devanagari",
  display: "swap",
  preload: false,
});

// Private app: generic titles only, never employee names or pay (master-rules.md).
export const metadata: Metadata = {
  title: { default: "GTF HR", template: "%s · GTF HR" },
  description: "GTF Technologies HR workspace.",
  robots: { index: false, follow: false },
  applicationName: "GTF HR",
  appleWebApp: { capable: true, title: "GTF HR", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get("gtf-theme")?.value);
  const lang = await getLang();
  return (
    <html lang={lang} data-theme={theme} data-scroll-behavior="smooth" className={`${googleSans.variable} ${devanagari.variable}`}>
      <body>
        <AppProviders>
          {children}
          <PwaProvider />
        </AppProviders>
      </body>
    </html>
  );
}
