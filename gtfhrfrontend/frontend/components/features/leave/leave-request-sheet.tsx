"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, Segmented, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useCommand } from "@/hooks/use-command";
import { requestLeaveAction } from "@/lib/actions/leave";
import { eachDay, isWeekend } from "@/lib/utils/date";
import { formatDateRange } from "@/lib/utils/format";
import type { LeaveBalance, LeaveType } from "@/types/leave";

interface Props {
  types: LeaveType[];
  balances: LeaveBalance[];
  holidayDates: string[];
  approver: string | null;
  today: string;
  defaultOpen?: boolean;
}

export function LeaveRequestSheet({ types, balances, holidayDates, approver, today, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [portion, setPortion] = useState("full");
  const { submit, pending, fieldError, formError } = useCommand(requestLeaveAction, {
    onSuccess: () => setOpen(false),
  });

  const type = types.find((item) => item.id === typeId);
  const balance = balances.find((item) => item.leaveTypeId === typeId);
  const singleDay = start === end;
  const halfAllowed = Boolean(type?.allowHalfDay && singleDay);
  const effectivePortion = halfAllowed ? portion : "full";
  // Display-only estimate. The server computes chargeable units from policy.
  const holidays = new Set(holidayDates);
  const workingDays = end >= start ? eachDay(start, end).filter((d) => !isWeekend(d) && !holidays.has(d)) : [];
  const first = workingDays[0];
  const last = workingDays[workingDays.length - 1];
  // Sandwich rule: off-days between the first and last working day are charged too.
  const working = type?.sandwich && first && last ? eachDay(first, last).length : workingDays.length;
  const estimate = working === 1 && effectivePortion !== "full" ? 0.5 : working;
  const needsDocument = type?.documentAfterDays !== null && type?.documentAfterDays !== undefined && estimate > type.documentAfterDays;
  const remaining = balance ? Number(balance.available) - estimate : null;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <AppIcon name="add" size={20} />
        Request leave
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Request leave"
        description={approver ? `Goes to ${approver} for approval.` : "Routed to HR for approval."}
        dismissible={!pending}
      >
        <form onSubmit={submit} className="form" id="leave-form" noValidate>
          <FormField id="leaveTypeId" label="Leave type" required error={fieldError("leaveTypeId")} hint={type?.description}>
            <SelectInput
              id="leaveTypeId"
              name="leaveTypeId"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              options={types.map((item) => ({ value: item.id, label: item.name }))}
              aria-invalid={Boolean(fieldError("leaveTypeId"))}
              aria-describedby={describedBy("leaveTypeId", fieldError("leaveTypeId"), Boolean(type))}
            />
          </FormField>
          <div className="form-row">
            <FormField id="startDate" label="From" required error={fieldError("startDate")}>
              <TextInput
                id="startDate"
                name="startDate"
                type="date"
                value={start}
                onChange={(event) => {
                  setStart(event.target.value);
                  if (event.target.value > end) setEnd(event.target.value);
                }}
                aria-invalid={Boolean(fieldError("startDate"))}
                aria-describedby={describedBy("startDate", fieldError("startDate"))}
                required
              />
            </FormField>
            <FormField id="endDate" label="To" required error={fieldError("endDate")}>
              <TextInput
                id="endDate"
                name="endDate"
                type="date"
                value={end}
                min={start}
                onChange={(event) => setEnd(event.target.value)}
                aria-invalid={Boolean(fieldError("endDate"))}
                aria-describedby={describedBy("endDate", fieldError("endDate"))}
                required
              />
            </FormField>
          </div>
          <Segmented
            name="portion"
            legend="Duration"
            value={effectivePortion}
            onChange={setPortion}
            options={[
              { value: "full", label: singleDay ? "Full day" : "Full days" },
              { value: "first_half", label: "First half", disabled: !halfAllowed },
              { value: "second_half", label: "Second half", disabled: !halfAllowed },
            ]}
          />
          {type && type.rules.length > 0 && (
            <ul className="time-rules small muted" aria-label={`${type.name} rules`}>
              {type.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          )}
          {needsDocument && (
            <FormField id="attachment" label={type?.documentAfterDays === 0 ? "Supporting document" : "Medical certificate"} required error={fieldError("attachment")} hint="PDF, JPG or PNG up to 5 MB.">
              <input id="attachment" type="file" name="attachment" accept="application/pdf,image/jpeg,image/png" className="input" aria-invalid={Boolean(fieldError("attachment"))} aria-describedby={describedBy("attachment", fieldError("attachment"), true)} />
            </FormField>
          )}
          <FormField id="reason" label="Reason" required error={fieldError("reason")} hint="Visible to your approver and HR.">
            <TextArea
              id="reason"
              name="reason"
              maxLength={500}
              rows={3}
              aria-invalid={Boolean(fieldError("reason"))}
              aria-describedby={describedBy("reason", fieldError("reason"), true)}
              required
            />
          </FormField>

          <div className="form-summary" aria-live="polite">
            <div className="form-summary-row">
              <span>Dates</span>
              <strong>{end >= start ? formatDateRange(start, end) : "—"}</strong>
            </div>
            <div className="form-summary-row">
              <span>Estimated working days</span>
              <strong className="num">{estimate}</strong>
            </div>
            {balance && (
              <div className="form-summary-row">
                <span>Available after request</span>
                <strong className={remaining !== null && remaining < 0 ? "num text-danger" : "num"}>
                  {remaining} of {balance.available}
                </strong>
              </div>
            )}
            <span className="small muted">
              {type?.sandwich ? "Sandwich rule: weekends and holidays between leave days are counted." : "Weekends and holidays aren’t counted."} Your roster week-offs apply; final units are confirmed on submit.
            </span>
          </div>

          {formError && (
            <Alert tone="danger" live title="Request not sent">
              {formError}
            </Alert>
          )}
          <div className="sheet-actions">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              {pending ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
