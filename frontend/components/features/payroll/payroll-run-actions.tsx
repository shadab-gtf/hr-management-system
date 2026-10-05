"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert, KeyValueList } from "@/components/ui/display";
import { FormField, TextArea, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useCommand } from "@/hooks/use-command";
import { payrollCommandAction } from "@/lib/actions/payroll";
import type { PayrollCommand } from "@/types/payroll";

interface RunFacts {
  runId: string;
  revision: number;
  payGroup: string;
  period: string;
  employees: number;
  net: string;
  digest: string;
}

const copy: Record<PayrollCommand, { button: string; title: string; confirm: string; pending: string; variant: "primary" | "secondary" | "danger" }> = {
  submit: { button: "Submit for review", title: "Submit for independent review", confirm: "I reviewed validation warnings and variances.", pending: "Submitting…", variant: "primary" },
  approve: { button: "Approve payroll", title: "Approve this payroll run", confirm: "I independently reviewed the totals, variances and digest below.", pending: "Approving…", variant: "primary" },
  reject: { button: "Return to operator", title: "Return run to operator", confirm: "", pending: "Returning…", variant: "danger" },
  publish: { button: "Publish payslips", title: "Publish payslips to employees", confirm: "Employees will see their payslips. This does not send any payment.", pending: "Publishing…", variant: "primary" },
};

export function PayrollRunActions({ commands, facts }: { commands: PayrollCommand[]; facts: RunFacts }) {
  const [active, setActive] = useState<PayrollCommand | null>(null);
  const { submit, pending, fieldError, formError } = useCommand(payrollCommandAction, { onSuccess: () => setActive(null) });
  const text = active ? copy[active] : null;
  return (
    <>
      {commands.map((command) => (
        <Button key={command} variant={command === "reject" ? "secondary" : copy[command].variant} onClick={() => setActive(command)}>
          <AppIcon name={command === "reject" ? "back" : command === "publish" ? "send" : "check"} size={20} />
          {copy[command].button}
        </Button>
      ))}
      <Sheet
        open={active !== null}
        onOpenChange={(open) => !open && setActive(null)}
        title={text?.title ?? ""}
        description="Confirm the exact run you are acting on."
        dismissible={!pending}
      >
        {active && text && (
          <form onSubmit={submit} className="form" noValidate>
            <input type="hidden" name="runId" value={facts.runId} />
            <input type="hidden" name="command" value={active} />
            <input type="hidden" name="expectedRevision" value={facts.revision} />
            <KeyValueList
              columns={1}
              items={[
                { label: "Pay group", value: facts.payGroup },
                { label: "Period", value: facts.period },
                { label: "Employees", value: String(facts.employees) },
                { label: "Net total", value: <strong className="num">{facts.net}</strong> },
                { label: "Input digest", value: <span className="digest">{facts.digest}</span>, hint: `Revision ${facts.revision}` },
              ]}
            />
            <FormField
              id="payroll-note"
              label={active === "reject" ? "What needs fixing?" : "Note (optional)"}
              required={active === "reject"}
              error={fieldError("note")}
            >
              <TextArea id="payroll-note" name="note" rows={3} maxLength={500} aria-invalid={Boolean(fieldError("note"))} aria-describedby={describedBy("payroll-note", fieldError("note"))} />
            </FormField>
            {active !== "reject" && (
              <label className="check-row">
                <input type="checkbox" name="confirm" aria-describedby={fieldError("confirm") ? "confirm-error" : undefined} />
                <span>{text.confirm}</span>
              </label>
            )}
            {fieldError("confirm") && (
              <p id="confirm-error" className="field-error">
                {fieldError("confirm")}
              </p>
            )}
            {active === "approve" && (
              <p className="notice-strip">
                <AppIcon name="lock" size={16} />
                In production this step also requires fresh multi-factor verification.
              </p>
            )}
            {formError && (
              <Alert tone="danger" live title="Not completed">
                {formError}
              </Alert>
            )}
            <div className="sheet-actions">
              <Button variant="secondary" onClick={() => setActive(null)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant={text.variant} pending={pending}>
                {pending ? text.pending : text.button}
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}
