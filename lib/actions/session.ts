"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiConfig } from "@/lib/api/core/config";
import { personaSchema } from "@/types/session";

/**
 * Mock sign-in: stores a demo persona id. In live mode the IdP (Keycloak/OIDC)
 * owns sign-in and this action redirects to the configured login route.
 */
export async function signInAction(formData: FormData) {
  if (apiConfig.mode === "live") redirect(process.env.GTF_LOGIN_URL ?? "/login");
  const persona = personaSchema.safeParse(formData.get("persona"));
  if (!persona.success) redirect("/login?error=persona");
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (requestHeaders.get("origin")?.startsWith("https:") ? "https" : "http");
  (await cookies()).set(apiConfig.sessionCookie, persona.data, {
    httpOnly: true,
    sameSite: "lax",
    // Secure whenever served over HTTPS; plain-HTTP LAN previews must still sign in.
    secure: protocol === "https",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function signOutAction() {
  (await cookies()).delete(apiConfig.sessionCookie);
  // Full navigation to a public page so no private workspace state is reused.
  redirect("/login?signedOut=1");
}
