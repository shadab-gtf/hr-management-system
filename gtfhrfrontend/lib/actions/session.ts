"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { ApiProblem } from "@/lib/api/core/problem";
import { signInWithCredentials } from "@/lib/api/session/credentials";
import { postSignInRoute, signOutEverywhere } from "@/lib/api/identity/identity.service";
import { personaSchema } from "@/types/session";
const safeNext = (value: FormDataEntryValue | null) => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/dashboard";
const credentialsSchema = z.object({ email: z.email().trim().toLowerCase().max(254), password: z.string().min(1).max(128) });
export async function signInAction(formData: FormData) {
  const next = safeNext(formData.get("next"));
  if (apiConfig.mode !== "mock") {
    const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
    if (!parsed.success) redirect("/login?error=credentials");
    let errorCode: string | null = null;
    try { await signInWithCredentials(parsed.data.email, parsed.data.password); }
    catch (error) { errorCode = error instanceof ApiProblem && error.status === 429 ? "rate" : error instanceof ApiProblem && error.status >= 500 ? "unavailable" : "credentials"; }
    if (errorCode) redirect(`/login?error=${errorCode}&next=${encodeURIComponent(next)}`);
    redirect(await postSignInRoute(next));
  }
  const persona = personaSchema.safeParse(formData.get("persona"));
  if (!persona.success) redirect("/login?error=persona");
  const requestHeaders = await headers();
  (await cookies()).set(apiConfig.sessionCookie, persona.data, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" || requestHeaders.get("x-forwarded-proto") === "https", path: "/", maxAge: 8 * 3600 });
  redirect(next);
}
export async function signOutAction() {
  if (apiConfig.mode !== "mock") await signOutEverywhere().catch(() => undefined);
  (await cookies()).delete(apiConfig.sessionCookie);
  redirect("/login?signedOut=1");
}
export async function signOutEverywhereAction() {
  if (apiConfig.mode !== "mock") await signOutEverywhere();
  (await cookies()).delete(apiConfig.sessionCookie);
  redirect("/login?signedOut=1");
}
