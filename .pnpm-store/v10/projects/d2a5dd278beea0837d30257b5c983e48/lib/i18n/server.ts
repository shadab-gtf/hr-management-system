import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { LANG_COOKIE, messages, parseLang, type Lang } from "@/lib/i18n";

/** Language preference from the `gtf-lang` cookie (default English). */
export const getLang = cache(async (): Promise<Lang> => parseLang((await cookies()).get(LANG_COOKIE)?.value));

export async function getMessages() {
  const lang = await getLang();
  return { lang, t: messages(lang) };
}
