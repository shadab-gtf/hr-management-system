"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, Segmented, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { createTicketAction } from "@/lib/actions/helpdesk";
import type { TicketCategory } from "@/types/workplace";



export function NewTicketSheet({ categories, defaultOpen = false }: { categories: TicketCategory[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const { submit, pending, fieldError, formError } = useCommand(createTicketAction, { onSuccess: () => setOpen(false) });
  const category = categories.find((item) => item.id === categoryId);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <AppIcon name="add" size={20} />
        New request
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Ask HR" description="You’ll get a reference and replies here." dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          <FormField id="t-category" label="Category" required error={fieldError("categoryId")} hint={category?.description}>
            <SelectInput id="t-category" name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} options={categories.map((item) => ({ value: item.id, label: item.confidential ? `${item.name} (confidential)` : item.name }))} />
          </FormField>
          {category?.confidential && (
            <Alert tone="info" title="Confidential routing">
              Only the designated HR partner for this category can see your request.
            </Alert>
          )}
          <FormField id="t-subject" label="Subject" required error={fieldError("subject")}>
            <TextInput id="t-subject" name="subject" maxLength={120} aria-invalid={Boolean(fieldError("subject"))} aria-describedby={describedBy("t-subject", fieldError("subject"))} />
          </FormField>
          <FormField id="t-description" label="Details" required error={fieldError("description")} hint="Don’t include passwords or full bank numbers.">
            <TextArea id="t-description" name="description" rows={5} maxLength={2000} aria-invalid={Boolean(fieldError("description"))} aria-describedby={describedBy("t-description", fieldError("description"), true)} />
          </FormField>
          <Segmented name="priority" legend="Priority" defaultValue="normal" options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
          {formError && <Alert tone="danger" live>{formError}</Alert>}
          <SheetActions onCancel={() => setOpen(false)} pending={pending} label="Send request" pendingLabel="Sending…" />
        </form>
      </Sheet>
    </>
  );
}
