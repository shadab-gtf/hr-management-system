"use client";

import { useState } from "react";
import { ConfirmButton, FormSheet } from "@/components/features/admin/form-sheet";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { addPayrollInputAction, holdSalaryAction, releaseSalaryAction, removePayrollInputAction } from "@/lib/actions/payroll";
import type { PayrollInputKind } from "@/types/payroll";

type Option = { id: string; label: string };

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

const kinds: { value: PayrollInputKind; label: string }[] = [
  { value: "bonus", label: "Bonus (one-time earning)" },
  { value: "incentive", label: "Incentive (one-time earning)" },
  { value: "arrears", label: "Arrears (earlier months)" },
  { value: "other_deduction", label: "Other deduction (recovery)" },
  { value: "lop_override", label: "LOP days override" },
];

export function AddPayrollInputSheet({ runId, employees, periodMonth }: { runId: string; employees: Option[]; periodMonth: string }) {
  const [kind, setKind] = useState<PayrollInputKind>("bonus");
  const p = "pin";
  return (
    <FormSheet draftKey={`payroll.input:${runId}`}
      action={addPayrollInputAction}
      title="Add payroll input"
      description="One-time inputs apply to this period only. The run recalculates immediately and the change is audited."
      trigger="Add input"
      icon="add"
      submitLabel="Add input"
      pendingLabel="Recalculating…"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="runId" value={runId} />
          <FormField id={`${p}-employee`} label="Employee" required error={fieldError("employeeId")}>
            <SelectInput id={`${p}-employee`} name="employeeId" defaultValue="" placeholder="Choose an employee" options={employees.map((item) => ({ value: item.id, label: item.label }))} {...err(`${p}-employee`, fieldError("employeeId"))} />
          </FormField>
          <FormField id={`${p}-kind`} label="Input type" required>
            <SelectInput id={`${p}-kind`} name="kind" value={kind} onChange={(event) => setKind(event.target.value as PayrollInputKind)} options={kinds} />
          </FormField>
          {kind === "lop_override" ? (
            <FormField id={`${p}-lop`} label="LOP days" required hint="Replaces any earlier LOP override for this employee. Half-day steps." error={fieldError("lopDays")}>
              <TextInput id={`${p}-lop`} name="lopDays" inputMode="decimal" placeholder="1.5" {...err(`${p}-lop`, fieldError("lopDays"), true)} />
            </FormField>
          ) : (
            <FormField id={`${p}-amount`} label={kind === "other_deduction" ? "Deduction amount (₹)" : "Amount (₹)"} required error={fieldError("amount")}>
              <TextInput id={`${p}-amount`} name="amount" inputMode="decimal" placeholder="15000" {...err(`${p}-amount`, fieldError("amount"))} />
            </FormField>
          )}
          {kind === "arrears" && (
            <div className="form-row">
              <FormField id={`${p}-from`} label="Arrears from" required error={fieldError("arrearsFrom")}>
                <TextInput id={`${p}-from`} name="arrearsFrom" type="month" max={periodMonth} {...err(`${p}-from`, fieldError("arrearsFrom"))} />
              </FormField>
              <FormField id={`${p}-months`} label="Number of months" required error={fieldError("arrearsMonths")}>
                <TextInput id={`${p}-months`} name="arrearsMonths" inputMode="numeric" placeholder="2" {...err(`${p}-months`, fieldError("arrearsMonths"))} />
              </FormField>
            </div>
          )}
          <FormField id={`${p}-note`} label="Reason" required hint="Shown in the variance explanation and audit trail." error={fieldError("note")}>
            <TextArea id={`${p}-note`} name="note" rows={3} maxLength={200} {...err(`${p}-note`, fieldError("note"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RemovePayrollInputButton({ runId, inputId }: { runId: string; inputId: string }) {
  return <ConfirmButton label="Remove" confirmLabel="Confirm remove" run={() => removePayrollInputAction(runId, inputId)} />;
}

export function HoldSalarySheet({ runId, employees }: { runId: string; employees: Option[] }) {
  const p = "hold";
  return (
    <FormSheet draftKey={`payroll.hold:${runId}`}
      action={holdSalaryAction}
      title="Hold salary"
      description="The payslip is still generated, but the salary is left out of the bank advice until it is released."
      trigger="Hold salary"
      triggerVariant="secondary"
      icon="lock"
      submitLabel="Hold salary"
      submitVariant="danger"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="runId" value={runId} />
          <FormField id={`${p}-employee`} label="Employee" required error={fieldError("employeeId")}>
            <SelectInput id={`${p}-employee`} name="employeeId" defaultValue="" placeholder="Choose an employee" options={employees.map((item) => ({ value: item.id, label: item.label }))} {...err(`${p}-employee`, fieldError("employeeId"))} />
          </FormField>
          <FormField id={`${p}-reason`} label="Reason" required error={fieldError("reason")}>
            <TextArea id={`${p}-reason`} name="reason" rows={3} maxLength={300} {...err(`${p}-reason`, fieldError("reason"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function ReleaseSalarySheet({ runId, holdId, name }: { runId: string; holdId: string; name: string }) {
  const p = `rel-${holdId}`;
  return (
    <FormSheet draftKey={`payroll.release:${runId}:${holdId}`} action={releaseSalaryAction} title={`Release salary · ${name}`} description="Released salaries are included in the next bank advice export." trigger="Release" triggerVariant="ghost" triggerSize="sm" submitLabel="Release salary">
      {(fieldError) => (
        <>
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="holdId" value={holdId} />
          <FormField id={`${p}-note`} label="Release note" required error={fieldError("note")}>
            <TextArea id={`${p}-note`} name="note" rows={3} maxLength={300} {...err(`${p}-note`, fieldError("note"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
