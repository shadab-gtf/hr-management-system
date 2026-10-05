"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { requestLetterAction } from "@/lib/actions/requests";
import { letterOptions } from "@/lib/labels";

export function LetterRequestSheet({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const sheet = useDisclosure(defaultOpen);
  const { submit, pending, fieldError, formError } = useCommand(requestLetterAction, { onSuccess: sheet.hide });
  return (
    <>
      <Button onClick={sheet.show}>
        <AppIcon name="mail" size={20} />
        Request a letter
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title="Request a letter" description="HR prepares and signs the letter. You’ll find it here once issued." dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          <FormField id="lt-type" label="Letter type" required error={fieldError("type")}>
            <SelectInput id="lt-type" name="type" defaultValue="employment_verification" options={letterOptions} />
          </FormField>
          <FormField id="lt-to" label="Addressed to" hint="Optional — e.g. a bank or embassy.">
            <TextInput id="lt-to" name="addressedTo" maxLength={120} />
          </FormField>
          <FormField id="lt-purpose" label="Purpose" required error={fieldError("purpose")}>
            <TextArea id="lt-purpose" name="purpose" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("purpose"))} />
          </FormField>
          {formError && <Alert tone="danger" live>{formError}</Alert>}
          <SheetActions onCancel={sheet.hide} pending={pending} label="Request letter" pendingLabel="Requesting…" />
        </form>
      </Sheet>
    </>
  );
}
