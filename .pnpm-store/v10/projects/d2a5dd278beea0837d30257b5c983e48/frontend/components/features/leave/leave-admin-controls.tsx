"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, Segmented, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { adjustBalanceAction, runYearEndAction } from "@/lib/actions/leave";
import type { PersonRef } from "@/types/common";

const err = (id: string, error: string | undefined, hint = false) => ({ "aria-invalid": Boolean(error), "aria-describedby": describedBy(id, error, hint) });

/** Picks whose ledger HR is reviewing (navigates; reads stay on the server). */
export function LedgerEmployeePicker({ people, selected }: { people: PersonRef[]; selected: string }) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="ledger-employee" className="sr-only">
        Employee ledger
      </label>
      <SelectInput
        id="ledger-employee"
        value={selected}
        onChange={(event) => router.push(`/admin/leave-policy?employee=${event.target.value}#hr-ledger`, { scroll: false })}
        options={people.map((person) => ({ value: person.id, label: `${person.name} · ${person.designation}` }))}
      />
    </>
  );
}

export function AdjustBalanceSheet({ employee, types }: { employee: PersonRef; types: { id: string; name: string; balance: string }[] }) {
  const [direction, setDirection] = useState("credit");
  return (
    <FormSheet action={adjustBalanceAction} title="Adjust leave balance" description={`${employee.name} · recorded in the ledger and the audit log; the employee is notified.`} trigger="Adjust balance" triggerVariant="secondary" triggerSize="sm" icon="edit" submitLabel="Record adjustment">
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employee.id} />
          <FormField id="adj-type" label="Leave type" required error={fieldError("leaveTypeId")}>
            <SelectInput id="adj-type" name="leaveTypeId" options={types.map((type) => ({ value: type.id, label: `${type.name} (balance ${type.balance})` }))} {...err("adj-type", fieldError("leaveTypeId"))} />
          </FormField>
          <Segmented
            name="direction"
            legend="Adjustment"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "credit", label: "Credit (+)" },
              { value: "debit", label: "Debit (−)" },
            ]}
          />
          <FormField id="adj-days" label="Days" required error={fieldError("days")} hint="Whole or half days">
            <TextInput id="adj-days" name="days" inputMode="decimal" defaultValue="1" {...err("adj-days", fieldError("days"), true)} />
          </FormField>
          <FormField id="adj-reason" label="Reason" required error={fieldError("reason")} hint="Visible to the employee in their ledger.">
            <TextArea id="adj-reason" name="reason" rows={3} maxLength={300} {...err("adj-reason", fieldError("reason"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function YearEndCommit({ year, disabledReason }: { year: string; disabledReason?: string | undefined }) {
  const [confirmed, setConfirmed] = useState(false);
  const { submit, pending, formError } = useCommand(runYearEndAction);
  if (disabledReason) return <p className="small muted">{disabledReason}</p>;
  return (
    <form onSubmit={submit} className="form" noValidate>
      <input type="hidden" name="year" value={year} />
      <label className="check-row">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I’ve reviewed the preview. Post carry-forward, encashment and lapse entries for {year} (runs once; effective 31 Dec).</span>
      </label>
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="submit" variant="danger" disabled={!confirmed} pending={pending}>
          {pending ? "Processing…" : `Commit year-end ${year}`}
        </Button>
      </div>
    </form>
  );
}
