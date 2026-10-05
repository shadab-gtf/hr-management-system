"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useCommand } from "@/hooks/use-command";
import { regularizeAction } from "@/lib/actions/attendance";
import { formatDate } from "@/lib/utils/format";
import type { AttendanceDay } from "@/types/attendance";

/** Proposes corrected times. Raw punches are never overwritten. */
export function RegularizationButton({ day, defaultOpen = false }: { day: AttendanceDay; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { submit, pending, fieldError, formError } = useCommand(regularizeAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Request correction
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Correct attendance"
        description={`${formatDate(day.date, "long")} · ${day.exception ?? "Review"}`}
        dismissible={!pending}
      >
        <form onSubmit={submit} className="form" noValidate>
          <input type="hidden" name="date" value={day.date} />
          <div className="form-summary">
            <div className="form-summary-row">
              <span>Recorded check-in</span>
              <strong className="num">{day.firstIn ?? "None"}</strong>
            </div>
            <div className="form-summary-row">
              <span>Recorded check-out</span>
              <strong className="num">{day.lastOut ?? "None"}</strong>
            </div>
          </div>
          <div className="form-row">
            <FormField id="proposedIn" label="Actual check-in" required error={fieldError("proposedIn")}>
              <TextInput
                id="proposedIn"
                name="proposedIn"
                type="time"
                defaultValue={day.firstIn ?? "09:30"}
                aria-invalid={Boolean(fieldError("proposedIn"))}
                aria-describedby={describedBy("proposedIn", fieldError("proposedIn"))}
                required
              />
            </FormField>
            <FormField id="proposedOut" label="Actual check-out" required error={fieldError("proposedOut")}>
              <TextInput
                id="proposedOut"
                name="proposedOut"
                type="time"
                defaultValue={day.lastOut ?? "18:30"}
                aria-invalid={Boolean(fieldError("proposedOut"))}
                aria-describedby={describedBy("proposedOut", fieldError("proposedOut"))}
                required
              />
            </FormField>
          </div>
          <FormField id="reg-reason" label="What happened?" required error={fieldError("reason")} hint="Your manager sees this with the original punches.">
            <TextArea
              id="reg-reason"
              name="reason"
              rows={3}
              maxLength={500}
              aria-invalid={Boolean(fieldError("reason"))}
              aria-describedby={describedBy("reg-reason", fieldError("reason"), true)}
              required
            />
          </FormField>
          {(formError ?? fieldError("date")) && (
            <Alert tone="danger" live title="Correction not sent">
              {formError ?? fieldError("date")}
            </Alert>
          )}
          <div className="sheet-actions">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              {pending ? "Sending…" : "Send for approval"}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
