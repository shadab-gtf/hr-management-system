"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { givePraiseAction } from "@/lib/actions/engage";
import { badgeIcons, companyValues, praiseBadges } from "@/types/engage-labels";
import type { PraiseBadge } from "@/types/engage";

const MAX_RECIPIENTS = 5;

export function PraiseComposer({ colleagues }: { colleagues: { id: string; name: string; department: string }[] }) {
  const sheet = useDisclosure();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [length, setLength] = useState(0);
  const reset = () => {
    setQuery("");
    setSelected([]);
    setLength(0);
  };
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(givePraiseAction, { draftKey: "praise.new",
    onSuccess: () => {
      sheet.hide();
      reset();
    },
  });
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => new Set(colleagues.filter((person) => !q || person.name.toLowerCase().includes(q) || person.department.toLowerCase().includes(q)).map((person) => person.id)), [colleagues, q]);
  const names = selected.map((id) => colleagues.find((person) => person.id === id)?.name ?? id);
  const toggle = (id: string, on: boolean) => setSelected((list) => (on ? [...list, id].slice(0, MAX_RECIPIENTS) : list.filter((item) => item !== id)));
  const recipientsError = fieldError("recipientIds");

  return (
    <>
      <Button onClick={sheet.show}>
        <AppIcon name="award" size={20} />
        Give praise
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title="Give praise" description="Recognise colleagues for living our values. Praise appears on the wall and in the Engage feed." dismissible={!pending} size="lg">
        <form ref={formRef} onSubmit={submit} className="form" noValidate>
          <DraftNotice draft={draft} />
          <fieldset className="ep-stack" aria-describedby={recipientsError ? "praise-recipients-error" : "praise-recipients-hint"}>
            <legend className="field-label">
              Who are you praising?<span className="required-mark" aria-hidden="true"> *</span>
            </legend>
            <div className="search-field">
              <AppIcon name="search" size={16} />
              <label htmlFor="praise-search" className="sr-only">
                Search colleagues
              </label>
              <TextInput id="praise-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or department" autoComplete="off" />
            </div>
            <p id="praise-recipients-hint" className="small muted" aria-live="polite">
              {selected.length ? `Selected: ${names.join(", ")}` : `Pick up to ${MAX_RECIPIENTS} colleagues.`}
            </p>
            <div className="ep-picker" role="group" aria-label="Colleagues">
              {colleagues.map((person) => {
                const isOn = selected.includes(person.id);
                return (
                  <label key={person.id} className="ep-pick" hidden={!matches.has(person.id) && !isOn}>
                    <input type="checkbox" name="recipientId" value={person.id} checked={isOn} disabled={!isOn && selected.length >= MAX_RECIPIENTS} onChange={(event) => toggle(person.id, event.target.checked)} />
                    <span className="ep-pick-text">
                      <span>{person.name}</span>
                      <span className="small muted">{person.department}</span>
                    </span>
                  </label>
                );
              })}
              {matches.size === 0 && <p className="small muted">No colleague matches “{query}”.</p>}
            </div>
            {recipientsError && (
              <p id="praise-recipients-error" className="field-error">
                {recipientsError}
              </p>
            )}
          </fieldset>
          <fieldset className="ep-stack">
            <legend className="field-label">
              Badge<span className="required-mark" aria-hidden="true"> *</span>
            </legend>
            <div className="ep-badge-options">
              {(Object.keys(praiseBadges) as PraiseBadge[]).map((badge, index) => (
                <label key={badge} className="ep-badge-option">
                  <input type="radio" name="badge" value={badge} defaultChecked={index === 0} />
                  <AppIcon name={badgeIcons[badge]} size={20} />
                  <span>{praiseBadges[badge]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <FormField id="praise-value" label="Company value" required error={fieldError("value")}>
            <SelectInput id="praise-value" name="value" defaultValue="win_together" options={Object.entries(companyValues).map(([value, label]) => ({ value, label }))} aria-describedby={describedBy("praise-value", fieldError("value"))} />
          </FormField>
          <FormField id="praise-message" label="Message" required error={fieldError("message")} hint={`${length}/500 · say what they did and why it mattered`}>
            <TextArea id="praise-message" name="message" rows={4} maxLength={500} onChange={(event) => setLength(event.target.value.length)} aria-invalid={Boolean(fieldError("message"))} aria-describedby={describedBy("praise-message", fieldError("message"), true)} />
          </FormField>
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <SheetActions onCancel={sheet.hide} pending={pending} label="Share praise" pendingLabel="Sharing…" />
        </form>
      </Sheet>
    </>
  );
}
