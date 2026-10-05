"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Meter, StatusBadge } from "@/components/ui/display";
import { FormField, Segmented, TextInput } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { saveDeclarationAction } from "@/lib/actions/salary";
import { formatMoney } from "@/lib/utils/format";
import type { ProofState, TaxDeclaration } from "@/types/salary";

const proofStatus: Record<ProofState, { label: string; tone: "neutral" | "warning" | "info" | "success" | "danger" }> = {
  not_required: { label: "No proof needed", tone: "neutral" },
  pending: { label: "Proof pending", tone: "warning" },
  submitted: { label: "Proof submitted", tone: "info" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Proof rejected", tone: "danger" },
};

const toPaise = (value: string) => {
  const [whole = "0", fraction = ""] = value.replace(/[^\d.]/g, "").split(".");
  return Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
};
const rupees = (paise: number) => formatMoney({ amount: `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`, currency: "INR" }, { decimals: false });
const plain = (amount: string) => (amount === "0.00" ? "" : amount.replace(/\.00$/, ""));

/** Declaration editor. Section totals are display hints; the server enforces limits. */
export function DeclarationForm({ declaration }: { declaration: TaxDeclaration }) {
  const [regime, setRegime] = useState(declaration.regime);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(declaration.sections.flatMap((section) => section.items.map((item) => [item.id, plain(item.declared.amount)]))),
  );
  const { submit, pending, fieldError, formError } = useCommand(saveDeclarationAction);
  const locked = !declaration.window.open || declaration.status === "locked";
  const totals = useMemo(
    () => Object.fromEntries(declaration.sections.map((section) => [section.code, section.items.reduce((sum, item) => sum + toPaise(values[item.id] ?? ""), 0)])),
    [declaration.sections, values],
  );
  const oldRegime = regime === "old";

  return (
    <form onSubmit={submit} className="stack" noValidate>
      <Card labelledBy="regime-heading">
        <CardHeader id="regime-heading" title="Tax regime" description="The new regime has lower rates but no deductions. You can switch until the window closes." />
        <CardBody className="stack">
          <Segmented
            name="regime"
            legend="Choose your regime"
            value={regime}
            onChange={(value) => setRegime(value === "old" ? "old" : "new")}
            options={[
              { value: "new", label: "New regime", disabled: locked },
              { value: "old", label: "Old regime", disabled: locked },
            ]}
          />
          {!oldRegime && (
            <p className="notice-strip">
              <AppIcon name="info" size={16} />
              Deductions below apply only to the old regime. Your employer PF is still considered automatically.
            </p>
          )}
        </CardBody>
      </Card>

      <Card labelledBy="hra-heading">
        <CardHeader id="hra-heading" title="House rent (HRA)" description="Rent paid for the accommodation you live in." />
        <CardBody>
          <div className="form-row">
            <FormField id="monthlyRent" label="Monthly rent (₹)" error={fieldError("monthlyRent")}>
              <TextInput id="monthlyRent" name="monthlyRent" inputMode="decimal" defaultValue={plain(declaration.monthlyRent.amount)} disabled={locked || !oldRegime} placeholder="0" />
            </FormField>
            <FormField id="rentCity" label="City type">
              <select id="rentCity" name="rentCity" className="input select" defaultValue={declaration.rentCity} disabled={locked || !oldRegime}>
                <option value="metro">Metro (Delhi, Mumbai, Kolkata, Chennai)</option>
                <option value="non_metro">Non-metro</option>
              </select>
            </FormField>
          </div>
        </CardBody>
      </Card>

      {declaration.sections.map((section) => {
        const limit = section.limit ? toPaise(section.limit.amount) : null;
        const total = totals[section.code] ?? 0;
        const over = limit !== null && total > limit;
        return (
          <Card key={section.code} labelledBy={`sec-${section.code}`}>
            <CardHeader
              id={`sec-${section.code}`}
              title={section.name}
              description={limit !== null ? `Declared ${rupees(total)} of ${rupees(limit)} limit` : undefined}
            />
            <CardBody className="stack">
              {limit !== null && <Meter value={Math.min(total, limit)} max={limit} label={`${section.code}: ${rupees(total)} of ${rupees(limit)}`} tone={over ? "warning" : "primary"} />}
              {section.items.map((item) => (
                <div key={item.id} className="declaration-row">
                  <FormField id={`item-${item.id}`} label={item.name} error={fieldError(`item.${item.id}`)}>
                    <TextInput
                      id={`item-${item.id}`}
                      name={`item.${item.id}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={values[item.id] ?? ""}
                      onChange={(event) => setValues((state) => ({ ...state, [item.id]: event.target.value }))}
                      disabled={locked || !oldRegime}
                    />
                  </FormField>
                  <StatusBadge status={proofStatus[item.proof]} />
                </div>
              ))}
              {over && (
                <p className="field-error" role="status">
                  Total exceeds the section limit; only {rupees(limit)} will count.
                </p>
              )}
            </CardBody>
          </Card>
        );
      })}

      {formError && (
        <Alert tone="danger" live title="Not saved">
          {formError}
        </Alert>
      )}
      {!locked && (
        <div className="form-footer">
          <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
            Save draft
          </Button>
          <Button type="submit" name="intent" value="submit" pending={pending}>
            {pending ? "Saving…" : "Submit declaration"}
          </Button>
        </div>
      )}
    </form>
  );
}
