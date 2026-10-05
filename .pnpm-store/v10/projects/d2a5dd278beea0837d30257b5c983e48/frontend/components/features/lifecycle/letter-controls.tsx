"use client";

import { useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextInput, describedBy } from "@/components/ui/field";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { useCommand } from "@/hooks/use-command";
import { generateLetterAction, saveLetterTemplateAction } from "@/lib/actions/lifecycle";
import { letterKindOptions } from "@/components/sections/lifecycle/labels";
import type { LetterTemplate } from "@/types/lifecycle";

type Option = { value: string; label: string };

/** Template + employee picker; the server renders the preview for the selection (URL state). */
export function LetterPicker({ templates, people, templateId, employeeId, purpose, addressedTo }: { templates: Option[]; people: Option[]; templateId: string; employeeId: string; purpose: string; addressedTo: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="stack">
      <div className="form-row">
        <FormField id="lp-template" label="Template">
          <SelectInput id="lp-template" value={templateId} onChange={(event) => update("template", event.target.value)} options={templates} placeholder="Choose a template…" />
        </FormField>
        <FormField id="lp-employee" label="Employee">
          <SelectInput id="lp-employee" value={employeeId} onChange={(event) => update("employee", event.target.value)} options={people} placeholder="Choose an employee…" />
        </FormField>
      </div>
      <div className="form-row">
        <FormField id="lp-purpose" label="Purpose (optional)" hint="Used by {{purpose}}; press Enter to apply.">
          <TextInput id="lp-purpose" defaultValue={purpose} maxLength={200} onBlur={(event) => event.target.value !== purpose && update("purpose", event.target.value.trim())} onKeyDown={(event) => event.key === "Enter" && update("purpose", event.currentTarget.value.trim())} aria-describedby="lp-purpose-hint" />
        </FormField>
        <FormField id="lp-to" label="Addressed to (optional)" hint="Used by {{addressedTo}}.">
          <TextInput id="lp-to" defaultValue={addressedTo} maxLength={120} onBlur={(event) => event.target.value !== addressedTo && update("to", event.target.value.trim())} onKeyDown={(event) => event.key === "Enter" && update("to", event.currentTarget.value.trim())} aria-describedby="lp-to-hint" />
        </FormField>
      </div>
    </div>
  );
}

export function GenerateLetterForm({ templateId, employeeId, purpose, addressedTo, disabledReason }: { templateId: string; employeeId: string; purpose: string; addressedTo: string; disabledReason: string | null }) {
  const { submit, pending, formError } = useCommand(generateLetterAction);
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="addressedTo" value={addressedTo} />
      {formError && <Alert tone="danger" live>{formError}</Alert>}
      <div className="sheet-actions">
        <Button type="submit" pending={pending} disabled={Boolean(disabledReason)} title={disabledReason ?? undefined}>
          <AppIcon name="document" size={20} />
          {pending ? "Generating…" : "Generate & issue letter"}
        </Button>
      </div>
      {disabledReason && <p className="small muted">{disabledReason}</p>}
    </form>
  );
}

export function TemplateSheet({ template, placeholders }: { template?: LetterTemplate; placeholders: { key: string; label: string }[] }) {
  const body = useRef<HTMLTextAreaElement>(null);
  const prefix = template ? `tp-${template.id}` : "tp-new";
  const insert = (key: string) => {
    const area = body.current;
    if (!area) return;
    const token = `{{${key}}}`;
    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? start;
    area.setRangeText(token, start, end, "end");
    area.focus();
  };
  return (
    <FormSheet draftKey={template ? `letter-template.edit:${template.id}` : "letter-template.new"} action={saveLetterTemplateAction} title={template ? `Edit ${template.name}` : "New letter template"} description="Placeholders are filled from the employee record when a letter is generated." trigger={template ? "Edit" : "New template"} triggerVariant={template ? "ghost" : "primary"} triggerSize={template ? "sm" : "md"} icon={template ? undefined : "add"} submitLabel={template ? "Save new version" : "Create template"}>
      {(fieldError) => (
        <>
          {template && <input type="hidden" name="id" value={template.id} />}
          <div className="form-row">
            <FormField id={`${prefix}-name`} label="Name" required error={fieldError("name")}>
              <TextInput id={`${prefix}-name`} name="name" defaultValue={template?.name} maxLength={80} aria-invalid={Boolean(fieldError("name"))} aria-describedby={describedBy(`${prefix}-name`, fieldError("name"))} />
            </FormField>
            <FormField id={`${prefix}-kind`} label="Letter type" required>
              <SelectInput id={`${prefix}-kind`} name="kind" defaultValue={template?.kind ?? "employment_verification"} options={letterKindOptions} />
            </FormField>
          </div>
          <FormField id={`${prefix}-subject`} label="Subject" required error={fieldError("subject")}>
            <TextInput id={`${prefix}-subject`} name="subject" defaultValue={template?.subject} maxLength={140} aria-invalid={Boolean(fieldError("subject"))} aria-describedby={describedBy(`${prefix}-subject`, fieldError("subject"))} />
          </FormField>
          <FormField id={`${prefix}-body`} label="Body" required error={fieldError("body")}>
            <textarea ref={body} id={`${prefix}-body`} name="body" rows={14} maxLength={8000} defaultValue={template?.body} className="input textarea lc-template-body" aria-invalid={Boolean(fieldError("body"))} aria-describedby={describedBy(`${prefix}-body`, fieldError("body"))} />
          </FormField>
          <div className="lc-chip-wrap" role="group" aria-label="Insert placeholder">
            {placeholders.map((item) => (
              <button key={item.key} type="button" className="chip" onClick={() => insert(item.key)} title={item.label}>
                {`{{${item.key}}}`}
              </button>
            ))}
          </div>
          <label className="check-row">
            <input type="checkbox" name="active" defaultChecked={template?.active ?? true} />
            <span>Active — available for generation and letter requests</span>
          </label>
        </>
      )}
    </FormSheet>
  );
}
