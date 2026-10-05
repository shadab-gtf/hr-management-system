"use client";

import type { ReactNode } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { saveProjectAction } from "@/lib/actions/timesheets";
import type { Project, ProjectMemberOption } from "@/types/timesheets";

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "closed", label: "Closed" },
];
const billableOptions = [
  { value: "yes", label: "Yes, client billable" },
  { value: "no", label: "No, internal" },
];

/** Create or edit one project (code, budget, dates, members, tasks). */
export function ProjectSheet({ project, people, today }: { project?: Project; people: ProjectMemberOption[]; today: string }) {
  const sheet = useDisclosure();
  const { submit, pending, state } = useCommand(saveProjectAction, { onSuccess: sheet.hide });
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const error = (name: string) => errors[name] ?? Object.entries(errors).find(([key]) => key.startsWith(`${name}.`))?.[1];
  const prefix = project ? `ts-prj-${project.id}` : "ts-prj-new";
  const departments = [...new Set(people.map((person) => person.department))];
  const members = new Set(project?.memberIds ?? []);
  const aria = (id: string, err: string | undefined, hint = false) => ({ "aria-invalid": Boolean(err), "aria-describedby": describedBy(id, err, hint) });

  const field = (name: string, label: string, control: (id: string, err: string | undefined) => ReactNode, options: { required?: boolean; hint?: string } = {}) => {
    const id = `${prefix}-${name}`;
    const err = error(name);
    return (
      <FormField id={id} label={label} error={err} {...(options.required ? { required: true } : {})} {...(options.hint ? { hint: options.hint } : {})}>
        {control(id, err)}
      </FormField>
    );
  };
  const membersError = error("memberIds");

  return (
    <>
      {project ? (
        <Button size="sm" variant="ghost" onClick={sheet.show} aria-label={`Edit ${project.code}`}>
          <AppIcon name="edit" size={16} />
          Edit
        </Button>
      ) : (
        <Button onClick={sheet.show}>
          <AppIcon name="add" size={20} />
          New project
        </Button>
      )}
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title={project ? `Edit ${project.code}` : "New project"} description="Members can log hours against its tasks while it is active." size="lg" dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          {project && (
            <>
              <input type="hidden" name="id" value={project.id} />
              <input type="hidden" name="version" value={project.version} />
            </>
          )}
          <div className="form-row">
            {field("code", "Project code", (id, err) => <TextInput id={id} name="code" defaultValue={project?.code} maxLength={24} placeholder="GTF-WEB-01" autoCapitalize="characters" {...aria(id, err, true)} />, { required: true, hint: "Uppercase, e.g. GTF-WEB-01" })}
            {field("name", "Project name", (id, err) => <TextInput id={id} name="name" defaultValue={project?.name} maxLength={80} {...aria(id, err)} />, { required: true })}
          </div>
          <div className="form-row">
            {field("client", "Client", (id, err) => <TextInput id={id} name="client" defaultValue={project?.client ?? ""} maxLength={80} {...aria(id, err, true)} />, { hint: "Leave empty for internal work" })}
            {field("billable", "Billable", (id, err) => <SelectInput id={id} name="billable" defaultValue={project ? (project.billable ? "yes" : "no") : "yes"} options={billableOptions} {...aria(id, err)} />, { required: true })}
          </div>
          <div className="form-row form-row--3">
            {field("budgetHours", "Budget (hours)", (id, err) => <TextInput id={id} name="budgetHours" inputMode="numeric" defaultValue={project ? String(project.budgetQuarters / 4) : ""} {...aria(id, err)} />, { required: true })}
            {field("startDate", "Start date", (id, err) => <TextInput id={id} name="startDate" type="date" defaultValue={project?.startDate ?? today} {...aria(id, err)} />, { required: true })}
            {field("endDate", "End date", (id, err) => <TextInput id={id} name="endDate" type="date" defaultValue={project?.endDate} {...aria(id, err)} />, { required: true })}
          </div>
          {field("status", "Status", (id, err) => <SelectInput id={id} name="status" defaultValue={project?.status ?? "active"} options={statusOptions} {...aria(id, err)} />, { required: true })}
          <fieldset className="ts-members" aria-describedby={membersError ? `${prefix}-members-error` : undefined}>
            <legend>
              Members<span className="required-mark" aria-hidden="true"> *</span>
            </legend>
            <div className="ts-members-list">
              {departments.map((department) => (
                <div key={department} className="ts-members-group" role="group" aria-label={department}>
                  <p className="ts-members-dept" aria-hidden="true">
                    {department}
                  </p>
                  {people
                    .filter((person) => person.department === department)
                    .map((person) => (
                      <label key={person.id} className="check-row">
                        <input type="checkbox" name="memberIds" value={person.id} defaultChecked={members.has(person.id)} />
                        <span>
                          {person.name} <span className="muted small">· {person.designation}</span>
                        </span>
                      </label>
                    ))}
                </div>
              ))}
            </div>
            {membersError && (
              <p id={`${prefix}-members-error`} className="field-error">
                {membersError}
              </p>
            )}
          </fieldset>
          {field("tasks", "Tasks", (id, err) => <TextArea id={id} name="tasks" rows={5} defaultValue={project?.tasks.join("\n") ?? ""} placeholder={"Discovery\nDesign\nBuild"} {...aria(id, err, true)} />, {
            required: true,
            hint: "One per line, 1 to 20 tasks. Tasks with logged hours can't be removed.",
          })}
          {state.status === "error" && (
            <Alert tone="danger" live>
              {state.message}
            </Alert>
          )}
          <SheetActions onCancel={sheet.hide} pending={pending} label={project ? "Save changes" : "Create project"} pendingLabel="Saving…" />
        </form>
      </Sheet>
    </>
  );
}
