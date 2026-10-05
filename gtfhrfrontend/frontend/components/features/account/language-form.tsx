"use client";

import { InlineForm } from "@/components/features/admin/form-sheet";
import { Segmented } from "@/components/ui/field";
import { saveLanguageAction } from "@/lib/i18n/actions";
import { languages, type Lang } from "@/lib/i18n";

/** Language preference, stored in the `gtf-lang` cookie. */
export function LanguageForm({ lang, legend, submitLabel }: { lang: Lang; legend: string; submitLabel: string }) {
  return (
    <InlineForm action={saveLanguageAction} submitLabel={submitLabel}>
      {() => <Segmented name="lang" legend={legend} defaultValue={lang} options={languages.map((item) => ({ value: item.id, label: item.native }))} />}
    </InlineForm>
  );
}
