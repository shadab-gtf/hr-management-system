import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiConfig } from "@/lib/api/core/config";
import { getPersonaOptions, getSession } from "@/lib/api/session/session.service";
import { LoginSection } from "@/components/sections/auth/login-section";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getSession()) redirect("/dashboard");
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : undefined;
  return (
    <LoginSection
      personas={getPersonaOptions()}
      next={next}
      signedOut={params.signedOut === "1"}
      invalid={params.error === "persona"}
      passwordLogin={apiConfig.mode !== "mock"}
      error={typeof params.error === "string" ? params.error : undefined}
    />
  );
}
