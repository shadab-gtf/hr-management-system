"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { requestLoanAction } from "@/lib/actions/salary";
import { formatMoney } from "@/lib/utils/format";

export function LoanRequestSheet() {
  const sheet = useDisclosure();
  const [amount, setAmount] = useState("");
  const [tenure, setTenure] = useState("6");
  const { submit, pending, fieldError, formError } = useCommand(requestLoanAction, { onSuccess: sheet.hide });
  const emi = Number(amount) > 0 ? Math.ceil(Number(amount) / Number(tenure)) : 0;
  return (
    <>
      <Button onClick={sheet.show}>
        <AppIcon name="add" size={20} />
        Request advance or loan
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title="Request an advance or loan" description="Finance reviews every request. Repayment is deducted from salary." dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          <FormField id="loan-type" label="Type" required>
            <SelectInput
              id="loan-type"
              name="type"
              defaultValue="salary_advance"
              options={[
                { value: "salary_advance", label: "Salary advance (up to 1 month’s gross)" },
                { value: "emergency", label: "Emergency loan" },
                { value: "laptop_loan", label: "Laptop loan" },
                { value: "personal_loan", label: "Personal loan" },
              ]}
            />
          </FormField>
          <div className="form-row">
            <FormField id="loan-amount" label="Amount (₹)" required error={fieldError("amount")}>
              <TextInput id="loan-amount" name="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(fieldError("amount"))} aria-describedby={describedBy("loan-amount", fieldError("amount"))} />
            </FormField>
            <FormField id="loan-tenure" label="Repay over" required>
              <SelectInput id="loan-tenure" name="tenureMonths" value={tenure} onChange={(event) => setTenure(event.target.value)} options={[3, 6, 9, 12, 18, 24].map((m) => ({ value: String(m), label: `${m} months` }))} />
            </FormField>
          </div>
          <div className="form-summary" aria-live="polite">
            <div className="form-summary-row">
              <span>Estimated monthly deduction</span>
              <strong className="num">{emi ? formatMoney({ amount: `${emi}.00`, currency: "INR" }, { decimals: false }) : "—"}</strong>
            </div>
            <span className="small muted">Interest-free per the synthetic policy. Finance confirms the schedule.</span>
          </div>
          <FormField id="loan-reason" label="Reason" required error={fieldError("reason")}>
            <TextArea id="loan-reason" name="reason" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("reason"))} />
          </FormField>
          {formError && <Alert tone="danger" live>{formError}</Alert>}
          <SheetActions onCancel={sheet.hide} pending={pending} label="Send request" pendingLabel="Sending…" />
        </form>
      </Sheet>
    </>
  );
}
