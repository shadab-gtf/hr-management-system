"use client";

import { useState } from "react";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { probationMonthOptions } from "@/components/features/admin/config-controls";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { createEmployeeAction, startExitAction, updateEmploymentAction } from "@/lib/actions/hr-admin";
import type { EmployeeDetail } from "@/types/employee";
import type { HrFormOptions } from "@/types/hr-config";

const types = [
  { value: "full_time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
] as const;
type EmploymentType = (typeof types)[number]["value"];

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

/** HR creates the person + employment; payroll compensation is set separately. */
export function AddEmployeeSheet({ options }: { options: HrFormOptions }) {
  const [type, setType] = useState<EmploymentType>("full_time");
  const fallback = options.probationDefaults[type];
  return (
    <FormSheet
      action={createEmployeeAction}
      title="Add employee"
      description="Creates the employee record and their onboarding checklist. Payroll sets compensation separately."
      trigger="Add employee"
      icon="add"
      submitLabel="Add employee"
      pendingLabel="Adding…"
    >
      {(fieldError) => (
        <>
          <FormField id="ne-name" label="Full name" required error={fieldError("name")}>
            <TextInput id="ne-name" name="name" autoComplete="off" maxLength={80} {...err("ne-name", fieldError("name"))} />
          </FormField>
          <FormField id="ne-designation" label="Designation" required error={fieldError("designation")}>
            <TextInput id="ne-designation" name="designation" maxLength={80} {...err("ne-designation", fieldError("designation"))} />
          </FormField>
          <div className="form-row">
            <FormField id="ne-department" label="Department" required error={fieldError("department")}>
              <SelectInput id="ne-department" name="department" placeholder="Choose…" options={options.departments.map((d) => ({ value: d, label: d }))} {...err("ne-department", fieldError("department"))} />
            </FormField>
            <FormField id="ne-location" label="Location" required error={fieldError("location")}>
              <SelectInput id="ne-location" name="location" placeholder="Choose…" options={options.locations.map((l) => ({ value: l, label: l }))} {...err("ne-location", fieldError("location"))} />
            </FormField>
          </div>
          <FormField id="ne-manager" label="Reporting manager" required error={fieldError("managerId")}>
            <SelectInput id="ne-manager" name="managerId" placeholder="Choose…" options={options.managers.map((m) => ({ value: m.id, label: `${m.name} · ${m.designation}` }))} {...err("ne-manager", fieldError("managerId"))} />
          </FormField>
          <div className="form-row">
            <FormField id="ne-joined" label="Joining date" required error={fieldError("joinedOn")}>
              <TextInput id="ne-joined" name="joinedOn" type="date" defaultValue={options.today} {...err("ne-joined", fieldError("joinedOn"))} />
            </FormField>
            <FormField id="ne-type" label="Employment type" required>
              <SelectInput id="ne-type" name="type" value={type} onChange={(event) => setType(event.target.value as EmploymentType)} options={types} />
            </FormField>
          </div>
          <FormField id="ne-probation" label="Probation" error={fieldError("probationMonths")} hint={`Policy default for this type: ${fallback ? `${fallback} month${fallback === 1 ? "" : "s"}` : "none"}`}>
            <SelectInput id="ne-probation" name="probationMonths" defaultValue="" options={[{ value: "", label: "Use policy default" }, ...probationMonthOptions]} {...err("ne-probation", fieldError("probationMonths"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function EditEmploymentSheet({ employee, options }: { employee: EmployeeDetail; options: HrFormOptions }) {
  const managers = options.managers.filter((m) => m.id !== employee.id);
  return (
    <FormSheet
      action={updateEmploymentAction}
      title="Edit job details"
      description="Recorded as an effective-dated change on the employment timeline. Salary changes go through Payroll."
      trigger="Edit job details"
      triggerVariant="secondary"
      icon="edit"
      submitLabel="Save change"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employee.id} />
          <input type="hidden" name="expectedVersion" value={employee.version} />
          <FormField id="ej-designation" label="Designation" required error={fieldError("designation")}>
            <TextInput id="ej-designation" name="designation" defaultValue={employee.designation} maxLength={80} {...err("ej-designation", fieldError("designation"))} />
          </FormField>
          <div className="form-row">
            <FormField id="ej-department" label="Department" required error={fieldError("department")}>
              <SelectInput id="ej-department" name="department" defaultValue={employee.department} options={options.departments.map((d) => ({ value: d, label: d }))} />
            </FormField>
            <FormField id="ej-location" label="Location" required error={fieldError("location")}>
              <SelectInput id="ej-location" name="location" defaultValue={employee.location} options={options.locations.map((l) => ({ value: l, label: l }))} />
            </FormField>
          </div>
          <FormField id="ej-manager" label="Reporting manager" error={fieldError("managerId")}>
            <SelectInput id="ej-manager" name="managerId" defaultValue={employee.manager?.id ?? ""} placeholder="No manager" options={managers.map((m) => ({ value: m.id, label: `${m.name} · ${m.designation}` }))} {...err("ej-manager", fieldError("managerId"))} />
          </FormField>
          <div className="form-row">
            <FormField id="ej-type" label="Employment type" required>
              <SelectInput id="ej-type" name="type" defaultValue={employee.employmentType} options={types} />
            </FormField>
            <FormField id="ej-probation" label="Probation" required error={fieldError("probationMonths")}>
              <SelectInput id="ej-probation" name="probationMonths" defaultValue={String(employee.probation.months)} options={probationMonthOptions} />
            </FormField>
          </div>
          <FormField id="ej-effective" label="Effective from" required error={fieldError("effectiveOn")}>
            <TextInput id="ej-effective" name="effectiveOn" type="date" defaultValue={options.today} {...err("ej-effective", fieldError("effectiveOn"))} />
          </FormField>
          <FormField id="ej-reason" label="Reason" required error={fieldError("reason")} hint="Shown on the employment timeline">
            <TextArea id="ej-reason" name="reason" rows={2} maxLength={300} {...err("ej-reason", fieldError("reason"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function StartExitSheet({ employee, today }: { employee: EmployeeDetail; today: string }) {
  return (
    <FormSheet
      action={startExitAction}
      title="Start exit"
      description={`Moves ${employee.name} to notice and opens the exit checklist. Records are retained; access is revoked on the last day.`}
      trigger="Start exit"
      triggerVariant="ghost"
      submitLabel="Start exit"
      submitVariant="danger"
      pendingLabel="Starting…"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employee.id} />
          <div className="form-row">
            <FormField id="ex-lwd" label="Last working day" required error={fieldError("lastWorkingDay")}>
              <TextInput id="ex-lwd" name="lastWorkingDay" type="date" min={today} {...err("ex-lwd", fieldError("lastWorkingDay"))} />
            </FormField>
            <FormField id="ex-reason" label="Reason" required>
              <SelectInput
                id="ex-reason"
                name="reason"
                defaultValue="resignation"
                options={[
                  { value: "resignation", label: "Resignation" },
                  { value: "contract_end", label: "Contract end" },
                  { value: "retirement", label: "Retirement" },
                  { value: "termination", label: "Termination" },
                  { value: "other", label: "Other" },
                ]}
              />
            </FormField>
          </div>
          <FormField id="ex-note" label="Internal note" error={fieldError("note")} hint="HR only. Not visible to the employee.">
            <TextArea id="ex-note" name="note" rows={2} maxLength={300} aria-describedby={describedBy("ex-note", fieldError("note"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
