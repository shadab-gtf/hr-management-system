"use client";

import { BreakdownTable } from "@/components/features/timesheets/breakdown-table";
import { Button } from "@/components/ui/button";
import { Alert, KeyValueList } from "@/components/ui/display";
import { FormField, TextArea, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { decideTimesheetAction } from "@/lib/actions/timesheets";
import { formatDateRange, formatDateTime } from "@/lib/utils/format";
import { hoursLabel, type TeamTimesheet } from "@/types/timesheets";

/** Manager review: per-project breakdown, then approve or send back with a comment. */
export function TimesheetDecisionSheet({ timesheet }: { timesheet: TeamTimesheet }) {
  const sheet = useDisclosure();
  const { submit, pending, fieldError, formError } = useCommand(decideTimesheetAction, { onSuccess: sheet.hide });
  const range = formatDateRange(timesheet.weekStart, timesheet.weekEnd);
  const id = `ts-comment-${timesheet.id}`;
  const error = fieldError("comment");
  return (
    <>
      <Button size="sm" onClick={sheet.show} aria-label={`Review ${timesheet.employee.name}, ${range}`}>
        Review
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title={`${timesheet.employee.name} · ${range}`} description="Check hours by project, then approve or send back." size="lg" dismissible={!pending}>
        <div className="stack">
          <KeyValueList
            columns={3}
            items={[
              { label: "Total", value: <span className="num">{hoursLabel(timesheet.totalQuarters)}</span> },
              { label: "Billable", value: <span className="num">{hoursLabel(timesheet.billableQuarters)}</span> },
              { label: "Submitted", value: timesheet.submittedAt ? formatDateTime(timesheet.submittedAt) : "—" },
            ]}
          />
          {timesheet.resubmission && timesheet.previousComment && (
            <Alert tone="info" title="Resubmitted after changes">
              Your earlier comment: “{timesheet.previousComment}”
            </Alert>
          )}
          <BreakdownTable weekStart={timesheet.weekStart} weekEnd={timesheet.weekEnd} rows={timesheet.breakdown} dayTotals={timesheet.dayTotals} caption={`Hours for ${timesheet.employee.name}, ${range}`} />
          <form onSubmit={submit} className="form" noValidate>
            <input type="hidden" name="timesheetId" value={timesheet.id} />
            <input type="hidden" name="version" value={timesheet.version} />
            <FormField id={id} label="Comment" hint="Required when sending back; optional when approving." error={error}>
              <TextArea id={id} name="comment" rows={3} maxLength={500} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, true)} />
            </FormField>
            {formError && (
              <Alert tone="danger" live>
                {formError}
              </Alert>
            )}
            <div className="sheet-actions">
              <Button type="submit" variant="danger" name="decision" value="reject" pending={pending}>
                Send back
              </Button>
              <Button type="submit" name="decision" value="approve" pending={pending}>
                Approve
              </Button>
            </div>
          </form>
        </div>
      </Sheet>
    </>
  );
}
