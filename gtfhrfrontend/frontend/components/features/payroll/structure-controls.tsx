"use client";

import { FormSheet } from "@/components/features/admin/form-sheet";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { decideStructureAction, proposeAssignmentAction, proposeTemplateAction } from "@/lib/actions/statutory";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

interface TemplateTerms {
  id: string;
  name: string;
  basicPctOfCtc: number;
  hraPctOfBasic: number;
  conveyance: string;
  lta: string;
  pf: boolean;
  gratuity: boolean;
}

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function ProposeTemplateSheet({ template }: { template: TemplateTerms }) {
  const p = `tpl-${template.id}`;
  return (
    <FormSheet
      action={proposeTemplateAction}
      title={`Propose change · ${template.name}`}
      description="Finance approves before the new version is published. Approved payroll runs stay frozen; open and future runs use the new version."
      trigger="Propose change"
      triggerVariant="secondary"
      triggerSize="sm"
      submitLabel="Send for approval"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="templateId" value={template.id} />
          <div className="form-row">
            <FormField id={`${p}-basic`} label="Basic (% of CTC)" required error={fieldError("basicPctOfCtc")}>
              <TextInput id={`${p}-basic`} name="basicPctOfCtc" inputMode="decimal" defaultValue={String(template.basicPctOfCtc)} {...err(`${p}-basic`, fieldError("basicPctOfCtc"))} />
            </FormField>
            <FormField id={`${p}-hra`} label="HRA (% of basic)" required error={fieldError("hraPctOfBasic")}>
              <TextInput id={`${p}-hra`} name="hraPctOfBasic" inputMode="decimal" defaultValue={String(template.hraPctOfBasic)} {...err(`${p}-hra`, fieldError("hraPctOfBasic"))} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField id={`${p}-conv`} label="Conveyance (₹/month)" required error={fieldError("conveyance")}>
              <TextInput id={`${p}-conv`} name="conveyance" inputMode="numeric" defaultValue={template.conveyance} {...err(`${p}-conv`, fieldError("conveyance"))} />
            </FormField>
            <FormField id={`${p}-lta`} label="LTA (₹/month)" required error={fieldError("lta")}>
              <TextInput id={`${p}-lta`} name="lta" inputMode="numeric" defaultValue={template.lta} {...err(`${p}-lta`, fieldError("lta"))} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField id={`${p}-pf`} label="Employer PF in CTC">
              <SelectInput id={`${p}-pf`} name="pf" defaultValue={template.pf ? "yes" : "no"} options={yesNo} />
            </FormField>
            <FormField id={`${p}-grat`} label="Gratuity provision (4.81%)">
              <SelectInput id={`${p}-grat`} name="gratuity" defaultValue={template.gratuity ? "yes" : "no"} options={yesNo} />
            </FormField>
          </div>
          <p className="field-hint">Special allowance is the balancing figure: monthly CTC less basic, HRA, fixed allowances, employer PF and gratuity.</p>
          <FormField id={`${p}-reason`} label="Reason for the approver" required error={fieldError("reason")}>
            <TextArea id={`${p}-reason`} name="reason" rows={3} maxLength={300} {...err(`${p}-reason`, fieldError("reason"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function AssignmentSheet({ groupKey, label, current, templates }: { groupKey: string; label: string; current: string; templates: { id: string; name: string }[] }) {
  const p = `asg-${groupKey.replace(/\W/g, "")}`;
  return (
    <FormSheet action={proposeAssignmentAction} title={`Assign template · ${label}`} description="Needs Finance approval before payroll uses it." trigger="Change" triggerVariant="ghost" triggerSize="sm" submitLabel="Send for approval">
      {(fieldError) => (
        <>
          <input type="hidden" name="groupKey" value={groupKey} />
          <FormField id={`${p}-tpl`} label="Template" required error={fieldError("templateId")}>
            <SelectInput id={`${p}-tpl`} name="templateId" defaultValue={current} options={templates.map((item) => ({ value: item.id, label: item.name }))} {...err(`${p}-tpl`, fieldError("templateId"))} />
          </FormField>
          <FormField id={`${p}-reason`} label="Reason for the approver" required error={fieldError("reason")}>
            <TextArea id={`${p}-reason`} name="reason" rows={3} maxLength={300} {...err(`${p}-reason`, fieldError("reason"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function StructureDecisionSheet({ changeId, reference, decision }: { changeId: string; reference: string; decision: "approve" | "reject" | "withdraw" }) {
  const p = `dec-${changeId}-${decision}`;
  const copy = {
    approve: { trigger: "Approve", title: `Approve ${reference}`, submit: "Approve & publish", variant: "primary" as const },
    reject: { trigger: "Reject", title: `Reject ${reference}`, submit: "Reject change", variant: "danger" as const },
    withdraw: { trigger: "Withdraw", title: `Withdraw ${reference}`, submit: "Withdraw change", variant: "danger" as const },
  }[decision];
  return (
    <FormSheet
      action={decideStructureAction}
      title={copy.title}
      description={decision === "approve" ? "The new version applies to open and future payroll runs." : undefined}
      trigger={copy.trigger}
      triggerVariant={decision === "approve" ? "primary" : "ghost"}
      triggerSize="sm"
      submitLabel={copy.submit}
      submitVariant={copy.variant}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="changeId" value={changeId} />
          <input type="hidden" name="decision" value={decision} />
          <FormField id={`${p}-note`} label={decision === "reject" ? "Reason" : "Note (optional)"} required={decision === "reject"} error={fieldError("note")}>
            <TextArea id={`${p}-note`} name="note" rows={3} maxLength={300} {...err(`${p}-note`, fieldError("note"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
