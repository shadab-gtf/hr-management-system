"use client";

import { useTransition } from "react";
import { setLanguageAction } from "@/lib/i18n/actions";
import type { Lang } from "@/lib/i18n";

/** One-tap English ↔ Hindi toggle in the top bar; the server re-renders the shell. */
export function LanguageSwitch({ lang, label }: { lang: Lang; label: string }) {
  const [pending, startTransition] = useTransition();
  const next: Lang = lang === "hi" ? "en" : "hi";
  return (
    <button
      type="button"
      className="button button--ghost lang-switch"
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={() => startTransition(() => setLanguageAction(next))}
    >
      {next === "hi" ? <span lang="hi">हि</span> : <span lang="en">EN</span>}
    </button>
  );
}
