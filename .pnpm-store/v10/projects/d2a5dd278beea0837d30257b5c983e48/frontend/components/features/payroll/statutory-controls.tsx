"use client";

import { useState } from "react";
import { ConfirmButton, FormSheet, InlineForm } from "@/components/features/admin/form-sheet";
import { FormField, SelectInput, TextInput, describedBy } from "@/components/ui/field";
import {
  generateForm16Action,
  recordChallanAction,
  savePfSettingsAction,
  savePtSlabsAction,
  saveStatutoryProfileAction,
  verifyBankAction,
} from "@/lib/actions/statutory";
import type { StatutoryEmployee } from "@/types/statutory";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

/* Challans ----------------------------------------------------------------- */

export function RecordChallanSheet({ options, today, preselect }: { options: { key: string; label: string; type: string; liability: string }[]; today: string; preselect?: string }) {
  const [key, setKey] = useState(preselect ?? "");
  const [amount, setAmount] = useState(options.find((item) => item.key === preselect)?.liability ?? "");
  const tds = key.startsWith("tds|");
  const p = preselect ? `chl-${preselect.replace(/\W/g, "")}` : "chl";
  return (
    <FormSheet draftKey={"statutory.challan"}
      action={recordChallanAction}
      title="Record challan payment"
      description="Record a payment made on the EPFO, ESIC, state or TIN-NSDL portal. Status is computed against the due date."
      trigger={preselect ? "Record" : "Record challan"}
      triggerVariant={preselect ? "ghost" : "primary"}
      triggerSize={preselect ? "sm" : "md"}
      icon={preselect ? undefined : "add"}
      submitLabel="Record challan"
    >
      {(fieldError) => (
        <>
          <FormField id={`${p}-obligation`} label="Liability" required error={fieldError("obligationKey")}>
            <SelectInput
              id={`${p}-obligation`}
              name="obligationKey"
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setAmount(options.find((item) => item.key === event.target.value)?.liability ?? "");
              }}
              placeholder="Choose an open liability"
              options={options.map((item) => ({ value: item.key, label: item.label }))}
              {...err(`${p}-obligation`, fieldError("obligationKey"))}
            />
          </FormField>
          <div className="form-row">
            <FormField id={`${p}-amount`} label="Amount paid (₹)" required error={fieldError("amount")}>
              <TextInput id={`${p}-amount`} name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} {...err(`${p}-amount`, fieldError("amount"))} />
            </FormField>
            <FormField id={`${p}-paid`} label="Paid on" required error={fieldError("paidOn")}>
              <TextInput id={`${p}-paid`} name="paidOn" type="date" max={today} defaultValue={today} {...err(`${p}-paid`, fieldError("paidOn"))} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField id={`${p}-no`} label={key.startsWith("epf|") ? "TRRN" : "Challan number"} required error={fieldError("challanNo")}>
              <TextInput id={`${p}-no`} name="challanNo" maxLength={24} autoComplete="off" {...err(`${p}-no`, fieldError("challanNo"))} />
            </FormField>
            {tds && (
              <FormField id={`${p}-bsr`} label="BSR code" required error={fieldError("bsrCode")}>
                <TextInput id={`${p}-bsr`} name="bsrCode" inputMode="numeric" maxLength={7} {...err(`${p}-bsr`, fieldError("bsrCode"))} />
              </FormField>
            )}
          </div>
          <p className="field-hint">Mock only: nothing is paid or filed; this records the reference for reconciliation.</p>
        </>
      )}
    </FormSheet>
  );
}

/* PF / ESI settings -------------------------------------------------------- */

export function PfSettingsForm({ wageBasis, esiCeiling, version }: { wageBasis: "ceiling" | "actual"; esiCeiling: string; version: number }) {
  return (
    <InlineForm draftKey={"statutory.pf-settings"} action={savePfSettingsAction} submitLabel="Save settings">
      {(fieldError) => (
        <>
          <input type="hidden" name="expectedVersion" value={version} />
          <FormField id="pf-basis" label="EPF wage basis" hint="Employee and employer 12% on the ₹15,000 ceiling, or on actual basic." error={fieldError("wageBasis")}>
            <SelectInput
              id="pf-basis"
              name="wageBasis"
              defaultValue={wageBasis}
              options={[
                { value: "ceiling", label: "Restrict to ₹15,000 ceiling" },
                { value: "actual", label: "Actual PF wages (no ceiling)" },
              ]}
              {...err("pf-basis", fieldError("wageBasis"), true)}
            />
          </FormField>
          <FormField id="esi-ceiling" label="ESI wage ceiling (₹ per month)" hint="Statutory ceiling ₹21,000. Change only when ESIC notifies a revision." error={fieldError("esiCeiling")}>
            <TextInput id="esi-ceiling" name="esiCeiling" inputMode="numeric" defaultValue={esiCeiling} {...err("esi-ceiling", fieldError("esiCeiling"), true)} />
          </FormField>
        </>
      )}
    </InlineForm>
  );
}

/* PT slabs ----------------------------------------------------------------- */

type SlabRow = { from: string; to: string; monthly: string; february: string };

export function PtSlabsSheet({ state, stateName, slabs, version }: { state: string; stateName: string; slabs: SlabRow[]; version: number }) {
  const rows = Array.from({ length: 6 }, (_, index) => slabs[index] ?? { from: "", to: "", monthly: "", february: "" });
  const p = `pt-${state}`;
  return (
    <FormSheet draftKey={`statutory.pt:${state}`}
      action={savePtSlabsAction}
      title={`Professional tax · ${stateName}`}
      description="Monthly gross slabs in whole rupees. Leave the last upper limit blank. Clear every row to record that the state levies no PT."
      trigger="Edit slabs"
      triggerVariant="ghost"
      triggerSize="sm"
      submitLabel="Save slabs"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="expectedVersion" value={version} />
          {rows.map((row, index) => (
            <fieldset key={index} className="stat-slab">
              <legend>Slab {index + 1}</legend>
              {(["from", "to", "monthly", "february"] as const).map((field) => {
                const id = `${p}-${index}-${field}`;
                const error = fieldError(`rows.${index}.${field}`);
                return (
                  <FormField key={field} id={id} label={{ from: "From ₹", to: "To ₹", monthly: "PT ₹/month", february: "February ₹" }[field]} error={error}>
                    <TextInput id={id} name={`rows.${index}.${field}`} inputMode="numeric" defaultValue={row[field]} {...err(id, error)} />
                  </FormField>
                );
              })}
            </fieldset>
          ))}
        </>
      )}
    </FormSheet>
  );
}

/* Employee profile --------------------------------------------------------- */

export function StatutoryProfileSheet({ row }: { row: StatutoryEmployee }) {
  const p = `sp-${row.employee.id}`;
  return (
    <FormSheet action={saveStatutoryProfileAction} title={`Statutory details · ${row.employee.name}`} description="Changes apply to open payroll runs and are audited." trigger="Edit" triggerVariant="ghost" triggerSize="sm" submitLabel="Save details">
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={row.employee.id} />
          <FormField id={`${p}-uan`} label="UAN" hint="12-digit Universal Account Number from EPFO." error={fieldError("uan")}>
            <TextInput id={`${p}-uan`} name="uan" inputMode="numeric" maxLength={12} defaultValue={row.uan ?? ""} {...err(`${p}-uan`, fieldError("uan"), true)} />
          </FormField>
          <FormField id={`${p}-esi`} label="ESI IP number" hint="10 digits; only for ESI-covered employees." error={fieldError("esiIp")}>
            <TextInput id={`${p}-esi`} name="esiIp" inputMode="numeric" maxLength={10} defaultValue={row.esiIp ?? ""} {...err(`${p}-esi`, fieldError("esiIp"), true)} />
          </FormField>
          <div className="form-row">
            <FormField id={`${p}-vpf`} label="VPF %" error={fieldError("vpfPercent")}>
              <TextInput id={`${p}-vpf`} name="vpfPercent" inputMode="numeric" defaultValue={String(row.vpfPercent)} {...err(`${p}-vpf`, fieldError("vpfPercent"))} />
            </FormField>
            <FormField id={`${p}-opt`} label="PF opt-out (Form 11)" error={fieldError("pfOptOut")}>
              <SelectInput
                id={`${p}-opt`}
                name="pfOptOut"
                defaultValue={row.pfStatus === "opted_out" ? "yes" : "no"}
                options={[
                  { value: "no", label: "EPF member" },
                  { value: "yes", label: "Opted out (excluded employee)" },
                ]}
                {...err(`${p}-opt`, fieldError("pfOptOut"))}
              />
            </FormField>
          </div>
        </>
      )}
    </FormSheet>
  );
}

export function BankVerifyButtons({ employeeId }: { employeeId: string }) {
  return (
    <span className="cluster">
      <ConfirmButton label="Verify" confirmLabel="Confirm verified" run={() => verifyBankAction(employeeId, "verified")} />
      <ConfirmButton label="Fail" confirmLabel="Confirm failed" run={() => verifyBankAction(employeeId, "failed")} />
    </span>
  );
}

export function GenerateForm16Button({ fy, label, disabledReason }: { fy: string; label: string; disabledReason?: string }) {
  return <ConfirmButton label={label} confirmLabel="Confirm generation" run={() => generateForm16Action(fy)} {...(disabledReason ? { disabledReason } : {})} />;
}
