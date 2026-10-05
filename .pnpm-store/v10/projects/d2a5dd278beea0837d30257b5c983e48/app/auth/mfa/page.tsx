import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiConfig } from "@/lib/api/core/config";
import { getSession } from "@/lib/api/session/session.service";
import { MfaChallengeSection } from "@/components/sections/identity/auth-sections";

export const metadata: Metadata = { title: "Verify it’s you", referrer: "no-referrer", robots: { index: false, follow: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function MfaPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  const next = typeof query.next === "string" && query.next.startsWith("/") && !query.next.startsWith("//") ? query.next : "/dashboard";
  if (!(await getSession())) redirect("/login");
  return <MfaChallengeSection next={next} available={apiConfig.mode !== "mock"} />;
}
