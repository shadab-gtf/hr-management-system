import type { Metadata } from "next";
import { apiConfig } from "@/lib/api/core/config";
import { describeSetPasswordLink, passwordRules } from "@/lib/api/identity/identity.service";
import { SetPasswordSection, type SetPasswordView } from "@/components/sections/identity/auth-sections";

/* Public page. Tokens must never leak through referrers, caches or indexing. */
export const metadata: Metadata = { title: "Set your password", referrer: "no-referrer", robots: { index: false, follow: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function SetPasswordPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  let view: SetPasswordView;
  if (query.done === "1") view = { kind: "done" };
  else if (apiConfig.mode === "mock") view = { kind: "demo" };
  else {
    const tokenHash = one(query.token_hash);
    const type = one(query.type);
    const reference = one(query.ref);
    const valid = tokenHash && /^[A-Za-z0-9_-]{16,128}$/.test(tokenHash) && (type === "invite" || type === "recovery") && reference;
    const link = valid ? await describeSetPasswordLink(reference) : null;
    view = valid && link ? { kind: "form", tokenHash, type, reference, loginId: link.loginId, min: passwordRules.min, max: passwordRules.max } : { kind: "invalid" };
  }
  return <SetPasswordSection view={view} />;
}
