"use client";

import { Button } from "@/components/ui/button";
import { useCommand } from "@/hooks/use-command";
import { remindTimesheetAction } from "@/lib/actions/timesheets";

/** Sends an in-app reminder (mock notification) for one missing week. */
export function RemindButton({ employeeId, employeeName, weekStart, weekLabel }: { employeeId: string; employeeName: string; weekStart: string; weekLabel: string }) {
  const { submit, pending, state } = useCommand(remindTimesheetAction);
  return (
    <form onSubmit={submit} className="ts-inline-form">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="weekStart" value={weekStart} />
      <Button type="submit" size="sm" variant="secondary" pending={pending} aria-label={`Remind ${employeeName} about the week of ${weekLabel}`}>
        {pending ? "Sending…" : "Remind"}
      </Button>
      {state.status === "error" && (
        <span className="field-error" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
