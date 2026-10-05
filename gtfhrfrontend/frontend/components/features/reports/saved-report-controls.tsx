"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmButton, FormSheet } from "@/components/features/admin/form-sheet";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, Segmented, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { deleteReportAction, removeScheduleAction, runScheduleNowAction, saveReportAction, scheduleReportAction } from "@/lib/actions/reports";
import type { PersonRef } from "@/types/common";
import type { ReportSpec, SavedReport } from "@/types/reports";
import type { Role } from "@/types/session";

const err = (id: string, error: string | undefined, hint = false) => ({ "aria-invalid": Boolean(error), "aria-describedby": describedBy(id, error, hint) });

/** Save the previewed spec as a new report, or update the one being edited. */
export function SaveReportSheet({
  spec,
  roles,
  existing,
  salary,
  trigger,
}: {
  spec: ReportSpec;
  roles: { id: Role; label: string }[];
  existing?: Pick<SavedReport, "id" | "version" | "name" | "description" | "visibility" | "sharedRoles">;
  salary: boolean;
  trigger: string;
}) {
  const router = useRouter();
  const sheet = useDisclosure();
  const [visibility, setVisibility] = useState<string>(existing?.visibility ?? "private");
  const { submit, pending, fieldError, formError } = useCommand(saveReportAction, {
    onSuccess: (result) => {
      sheet.hide();
      if (!existing && result.reference) router.push(`/admin/reports/builder?saved=${encodeURIComponent(result.reference)}`);
    },
  });
  const id = existing ? `save-${existing.id}` : "save-new";
  return (
    <>
      <Button variant={existing ? "primary" : "secondary"} size="sm" onClick={sheet.show}>
        <AppIcon name={existing ? "edit" : "add"} size={16} />
        {trigger}
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title={existing ? "Update saved report" : "Save report"} description="Saves the dataset, columns, filters, sort and grouping you previewed." dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          <input type="hidden" name="spec" value={JSON.stringify(spec)} />
          {existing && (
            <>
              <input type="hidden" name="id" value={existing.id} />
              <input type="hidden" name="version" value={existing.version} />
            </>
          )}
          <FormField id={`${id}-name`} label="Report name" required error={fieldError("name")}>
            <TextInput id={`${id}-name`} name="name" defaultValue={existing?.name ?? ""} maxLength={80} required {...err(`${id}-name`, fieldError("name"))} />
          </FormField>
          <FormField id={`${id}-desc`} label="Description" hint="Optional — what it's for and who reads it." error={fieldError("description")}>
            <TextArea id={`${id}-desc`} name="description" rows={2} defaultValue={existing?.description ?? ""} maxLength={240} {...err(`${id}-desc`, fieldError("description"), true)} />
          </FormField>
          <Segmented
            name="visibility"
            legend="Visibility"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "private", label: "Only me" },
              { value: "shared", label: "Shared with roles" },
            ]}
          />
          {visibility === "shared" && (
            <fieldset className="rpt-fieldset" aria-describedby={fieldError("sharedRoles") ? `${id}-roles-error` : `${id}-roles-hint`}>
              <legend>Share with</legend>
              {roles.map((role) => (
                <label key={role.id} className="check-row">
                  <input type="checkbox" name="sharedRoles" value={role.id} defaultChecked={existing?.sharedRoles.includes(role.id) ?? role.id === "hr_operator"} />
                  <span>{role.label}</span>
                </label>
              ))}
              {fieldError("sharedRoles") ? (
                <p id={`${id}-roles-error`} className="field-error">
                  {fieldError("sharedRoles")}
                </p>
              ) : (
                <p id={`${id}-roles-hint`} className="field-hint">
                  {salary ? "This report has salary figures: share only with payroll operators and Finance approvers." : "People in these roles can open and download it; only you can edit."}
                </p>
              )}
            </fieldset>
          )}
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <SheetActions onCancel={sheet.hide} pending={pending} label={existing ? "Update report" : "Save report"} pendingLabel="Saving…" />
        </form>
      </Sheet>
    </>
  );
}

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label, index) => ({ value: String(index + 1), label }));

function ScheduleFields({ report, recipients, fieldError }: { report: SavedReport; recipients: PersonRef[]; fieldError: (name: string) => string | undefined }) {
  const [frequency, setFrequency] = useState(report.schedule?.frequency ?? "weekly");
  const id = `sch-${report.id}`;
  const chosen = new Set(report.schedule?.recipients.map((person) => person.id) ?? [report.owner.id]);
  return (
    <>
      <input type="hidden" name="reportId" value={report.id} />
      <FormField id={`${id}-freq`} label="Frequency">
        <SelectInput
          id={`${id}-freq`}
          name="frequency"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value === "daily" || event.target.value === "monthly" ? event.target.value : "weekly")}
          options={[
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
      </FormField>
      <div className="form-row">
        {frequency === "weekly" && (
          <FormField id={`${id}-day`} label="Day">
            <SelectInput id={`${id}-day`} name="weekday" defaultValue={String(report.schedule?.weekday ?? 1)} options={weekdays} />
          </FormField>
        )}
        {frequency === "monthly" && (
          <FormField id={`${id}-dom`} label="Day of month" hint="1–28, so every month has it." error={fieldError("dayOfMonth")}>
            <TextInput id={`${id}-dom`} name="dayOfMonth" type="number" min={1} max={28} inputMode="numeric" defaultValue={report.schedule?.dayOfMonth ?? 1} {...err(`${id}-dom`, fieldError("dayOfMonth"), true)} />
          </FormField>
        )}
        <FormField id={`${id}-time`} label="Time (IST)" error={fieldError("time")}>
          <TextInput id={`${id}-time`} name="time" type="time" defaultValue={report.schedule?.time ?? "09:00"} required {...err(`${id}-time`, fieldError("time"))} />
        </FormField>
      </div>
      <FormField id={`${id}-format`} label="File format">
        <SelectInput id={`${id}-format`} name="format" defaultValue={report.schedule?.format ?? "csv"} options={[{ value: "csv", label: "CSV" }, { value: "xls", label: "Excel (.xls)" }]} />
      </FormField>
      <fieldset className="rpt-fieldset" aria-describedby={fieldError("recipients") ? `${id}-rcpt-error` : `${id}-rcpt-hint`}>
        <legend>Recipients</legend>
        {recipients.map((person) => (
          <label key={person.id} className="check-row">
            <input type="checkbox" name="recipients" value={person.id} defaultChecked={chosen.has(person.id)} />
            <span>
              {person.name} <span className="muted small">· {person.designation}</span>
            </span>
          </label>
        ))}
        {fieldError("recipients") ? (
          <p id={`${id}-rcpt-error`} className="field-error">
            {fieldError("recipients")}
          </p>
        ) : (
          <p id={`${id}-rcpt-hint`} className="field-hint">
            Only people with report access can receive it.
          </p>
        )}
      </fieldset>
      <label className="check-row">
        <input type="checkbox" name="active" defaultChecked={report.schedule?.active ?? true} />
        <span>Schedule active</span>
      </label>
      <Alert tone="info">Mock delivery — files are generated and logged, never emailed.</Alert>
    </>
  );
}

export function ScheduleSheet({ report, recipients }: { report: SavedReport; recipients: PersonRef[] }) {
  return (
    <FormSheet
      action={scheduleReportAction}
      title={`Schedule “${report.name}”`}
      description="Delivered as an attachment to each recipient."
      trigger={report.schedule ? "Edit schedule" : "Schedule"}
      triggerVariant="ghost"
      triggerSize="sm"
      icon="timer"
      submitLabel="Save schedule"
    >
      {(fieldError) => <ScheduleFields report={report} recipients={recipients} fieldError={fieldError} />}
    </FormSheet>
  );
}

export function RunNowButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await runScheduleNowAction(id);
          if (result.status === "success") toast.success(result.message);
          else if (result.status === "error") toast.error(result.message);
        })
      }
    >
      <AppIcon name="send" size={16} />
      Run now
    </Button>
  );
}

export function DeleteReportButton({ id }: { id: string }) {
  return <ConfirmButton label="Delete" confirmLabel="Confirm delete" run={() => deleteReportAction(id)} />;
}

export function RemoveScheduleButton({ id }: { id: string }) {
  return <ConfirmButton label="Remove schedule" confirmLabel="Confirm remove" run={() => removeScheduleAction(id)} />;
}
