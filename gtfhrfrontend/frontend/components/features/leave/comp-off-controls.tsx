"use client";

import { useState } from "react";
import { ConfirmButton, FormSheet } from "@/components/features/admin/form-sheet";
import { FormField, Segmented, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { cancelCompOffAction, cancelEncashmentAction, claimCompOffAction, requestEncashmentAction } from "@/lib/actions/leave";
import { formatDate, formatDuration, formatMoney } from "@/lib/utils/format";
import type { CompOffEligibleDay, EncashOption } from "@/types/leave";

const err = (id: string, error: string | undefined, hint = false) => ({ "aria-invalid": Boolean(error), "aria-describedby": describedBy(id, error, hint) });

export function CompOffClaimSheet({ days, today, windowDays }: { days: CompOffEligibleDay[]; today: string; windowDays: number }) {
  const initial = days.find((day) => day.maxPortion === "full") ?? days[0];
  const [date, setDate] = useState(initial?.date ?? "");
  const [portion, setPortion] = useState(initial?.maxPortion ?? "full");
  const picked = days.find((day) => day.date === date);
  return (
    <FormSheet draftKey={"comp-off.claim"}
      action={claimCompOffAction}
      title="Claim comp-off"
      description={`For a week-off or holiday you worked in the last ${windowDays} days. Checked against your punches: 4 h = half day, 8 h = full day.`}
      trigger="Claim comp-off"
      icon="add"
      submitLabel="Send claim"
      pendingLabel="Sending…"
    >
      {(fieldError) => (
        <>
          {days.length > 0 && (
            <fieldset className="checks">
              <legend>Days you worked off-roster</legend>
              <div className="chip-row">
                {days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    className={`chip${day.date === date ? " chip--active" : ""}`}
                    aria-pressed={day.date === date}
                    onClick={() => {
                      setDate(day.date);
                      setPortion(day.maxPortion);
                    }}
                  >
                    {formatDate(day.date, "weekday")} · {formatDuration(day.workedMinutes)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <FormField id="co-date" label="Date worked" required error={fieldError("workedDate")} hint={picked ? `${picked.dayKind} · ${picked.punches}` : "Pick a week-off or holiday with face-device punches."}>
            <TextInput id="co-date" name="workedDate" type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} {...err("co-date", fieldError("workedDate"), true)} />
          </FormField>
          <Segmented
            name="portion"
            legend="Credit"
            value={portion}
            onChange={(value) => setPortion(value === "half" ? "half" : "full")}
            options={[
              { value: "full", label: "Full day (8 h+)" },
              { value: "half", label: "Half day (4 h+)" },
            ]}
          />
          {fieldError("portion") && <p className="field-error small text-danger">{fieldError("portion")}</p>}
          <FormField id="co-reason" label="What did you work on?" required error={fieldError("reason")}>
            <TextArea id="co-reason" name="reason" rows={3} maxLength={300} {...err("co-reason", fieldError("reason"))} />
          </FormField>
          <p className="small muted">Approved credits expire 60 days after the day worked and lapse automatically if unused.</p>
        </>
      )}
    </FormSheet>
  );
}

export function EncashSheet({ options, payrollMonth }: { options: EncashOption[]; payrollMonth: string }) {
  const [typeId, setTypeId] = useState(options[0]?.leaveTypeId ?? "");
  const [days, setDays] = useState("1");
  const option = options.find((item) => item.leaveTypeId === typeId);
  const estimate = option ? Math.round(Number(option.perDay.amount) * 100 * Math.max(Number(days) || 0, 0)) : 0;
  return (
    <FormSheet draftKey={"leave.encash"} action={requestEncashmentAction} title="Request leave encashment" description="HR reviews the request. Approved amounts are paid with payroll." trigger="Request encashment" triggerVariant="secondary" icon="moneyIn" submitLabel="Send to HR" pendingLabel="Sending…">
      {(fieldError) => (
        <>
          <FormField id="en-type" label="Leave type" required error={fieldError("leaveTypeId")}>
            <SelectInput id="en-type" name="leaveTypeId" value={typeId} onChange={(event) => setTypeId(event.target.value)} options={options.map((item) => ({ value: item.leaveTypeId, label: item.name }))} {...err("en-type", fieldError("leaveTypeId"))} />
          </FormField>
          <FormField id="en-days" label="Days to encash" required error={fieldError("days")} hint={option ? `Up to ${option.maxNow} now · keep ${option.retain} · ${option.remainingThisYear} left this year` : undefined}>
            <TextInput id="en-days" name="days" type="number" inputMode="numeric" min={1} step={1} value={days} onChange={(event) => setDays(event.target.value)} {...err("en-days", fieldError("days"), true)} />
          </FormField>
          <FormField id="en-reason" label="Reason (optional)" error={fieldError("reason")}>
            <TextArea id="en-reason" name="reason" rows={2} maxLength={300} />
          </FormField>
          {option && (
            <div className="form-summary" aria-live="polite">
              <div className="form-summary-row">
                <span>Per day (basic ÷ 26)</span>
                <strong className="num">{formatMoney(option.perDay)}</strong>
              </div>
              <div className="form-summary-row">
                <span>Estimated payout</span>
                <strong className="num">{formatMoney({ amount: (estimate / 100).toFixed(2), currency: "INR" })}</strong>
              </div>
              <div className="form-summary-row">
                <span>Payroll month if approved now</span>
                <strong>{formatDate(payrollMonth, "month")}</strong>
              </div>
              <span className="small muted">Gross, before tax. Mock: recorded against payroll, not added to the mock payroll run.</span>
            </div>
          )}
        </>
      )}
    </FormSheet>
  );
}

export function WithdrawClaimButton({ id }: { id: string }) {
  return <ConfirmButton label="Withdraw" confirmLabel="Confirm withdraw" run={() => cancelCompOffAction(id)} />;
}
export function WithdrawEncashButton({ id }: { id: string }) {
  return <ConfirmButton label="Withdraw" confirmLabel="Confirm withdraw" run={() => cancelEncashmentAction(id)} />;
}
