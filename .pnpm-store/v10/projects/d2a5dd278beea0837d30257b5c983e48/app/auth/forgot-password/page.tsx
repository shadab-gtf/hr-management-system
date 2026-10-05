import type { Metadata } from "next";
import { connection } from "next/server";
import { apiConfig } from "@/lib/api/core/config";
import { recoveryLinkMinutes } from "@/lib/api/identity/identity.service";
import { ForgotPasswordSection } from "@/components/sections/identity/auth-sections";

export const metadata: Metadata = { title: "Reset your password", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage() {
  await connection(); // per-request render: never prerendered or cached
  return <ForgotPasswordSection available={apiConfig.mode !== "mock"} minutes={recoveryLinkMinutes()} />;
}
