import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { parseTheme } from "@/lib/utils/theme";
import { AppProviders } from "@/components/features/app-providers";
import "./globals.css";

const googleSans = localFont({
  src: "./fonts/google-sans-latin.woff2",
  variable: "--font-google-sans",
  weight: "400 700",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});
export const metadata: Metadata = {
  title: { default: "Foundation · GTF HR", template: "%s · GTF HR" },
  description: "GTF HR frontend foundation preview. All records are synthetic.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const theme = parseTheme((await cookies()).get("gtf-theme")?.value);
  return (
    <html lang="en" data-theme={theme} className={googleSans.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
