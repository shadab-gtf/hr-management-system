"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { failure, formObject, success, validationError } from "@/lib/actions/result";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import type { ActionResult } from "@/types/action";

const langSchema = z.enum(["en", "hi"], { error: "Choose English or Hindi." });

async function store(lang: Lang) {
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: false, secure: process.env.NODE_ENV === "production" });
}

/** Settings form: language preference (UI only; not stored on the HR record). */
export async function saveLanguageAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = langSchema.safeParse(formObject(formData).lang);
  if (!parsed.success) return validationError(new z.ZodError(parsed.error.issues.map((issue) => ({ ...issue, path: ["lang"] }))));
  try {
    await store(parsed.data);
    refresh();
    return success(parsed.data === "hi" ? "भाषा सहेजी गई: हिन्दी" : "Language saved: English");
  } catch (error) {
    return failure(error);
  }
}

/** Shell switcher: flips the language in one tap. */
export async function setLanguageAction(lang: Lang): Promise<void> {
  const parsed = langSchema.safeParse(lang);
  if (!parsed.success) return;
  await store(parsed.data);
  refresh();
}
