"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { requestPermissionAction } from "@/lib/actions/requests";

/** Short absence during a working day (up to 3 hours, twice a month — synthetic policy). */
export function PermissionSheet({ today, defaultOpen = false }: { today: string; defaultOpen?: boolean }) {
  const sheet = useDisclosure(defaultOpen);
  const { submit, pending, fieldError, formError } = useCommand(requestPermissionAction, { onSuccess: sheet.hide });
  return (
    <>
      <Button variant="secondary" onClick={sheet.show}>
        <AppIcon name="timer" size={20} />
        Request permission
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title="Request permission" description="Step out for up to 3 hours. Two permissions per month." dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          <FormField id="pm-date" label="Date" required error={fieldError("date")}>
            <TextInput id="pm-date" name="date" type="date" min={today} defaultValue={today} aria-invalid={Boolean(fieldError("date"))} aria-describedby={describedBy("pm-date", fieldError("date"))} />
          </FormField>
          <div className="form-row">
            <FormField id="pm-from" label="From" required error={fieldError("from")}>
              <TextInput id="pm-from" name="from" type="time" defaultValue="15:00" aria-invalid={Boolean(fieldError("from"))} />
            </FormField>
            <FormField id="pm-to" label="To" required error={fieldError("to")}>
              <TextInput id="pm-to" name="to" type="time" defaultValue="17:00" aria-invalid={Boolean(fieldError("to"))} aria-describedby={describedBy("pm-to", fieldError("to"))} />
            </FormField>
          </div>
          <FormField id="pm-reason" label="Reason" required error={fieldError("reason")}>
            <TextArea id="pm-reason" name="reason" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("reason"))} />
          </FormField>
          {formError && <Alert tone="danger" live>{formError}</Alert>}
          <SheetActions onCancel={sheet.hide} pending={pending} label="Send request" pendingLabel="Sending…" />
        </form>
      </Sheet>
    </>
  );
}
