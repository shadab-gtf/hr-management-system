"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import {
  FormField,
  SelectInput,
  TextArea,
  TextInput,
  describedBy,
} from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import {
  copyInviteLinkAction,
  grantRoleAction,
  inviteAccountAction,
  revokeRoleAction,
  setAccountDisabledAction,
} from "@/lib/actions/identity";
import { roleLabels, scopableRoles } from "@/types/identity";
import type { Role } from "@/types/session";

/** Sends (or re-sends) the welcome mail: login ID + single-use set-password link. */
export function InviteAccountButton({
  employeeId,
  resend,
}: {
  employeeId: string;
  resend: boolean;
}) {
  const { submit, pending, formError } = useCommand(inviteAccountAction);
  return (
    <form onSubmit={submit} className="cluster">
      <input type="hidden" name="employeeId" value={employeeId} />
      <Button
        type="submit"
        size="sm"
        variant={resend ? "ghost" : "secondary"}
        pending={pending}
      >
        <AppIcon name="mail" size={16} />
        {pending ? "Sending…" : resend ? "Resend invite" : "Send invite"}
      </Button>
      {formError && (
        <span className="small text-danger" role="alert">
          {formError}
        </span>
      )}
    </form>
  );
}

/** Issues a fresh single-use link for HR to hand over when mail isn't delivered. */
export function CopyInviteLinkButton({
  employeeId,
  name,
}: {
  employeeId: string;
  name: string;
}) {
  const sheet = useDisclosure();
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<{
    link: string;
    expiresAt: string;
  } | null>(null);
  const close = (open: boolean) => {
    sheet.setOpen(open);
    // Drop the link from memory as soon as the sheet closes.
    if (!open) setIssued(null);
  };
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await copyInviteLinkAction(employeeId);
            if (result.status === "error") {
              toast.error(result.message);
              return;
            }
            setIssued({ link: result.link, expiresAt: result.expiresAt });
            sheet.show();
          })
        }
      >
        <AppIcon name="key" size={16} />
        Copy invite link
      </Button>
      <Sheet
        open={sheet.open}
        onOpenChange={close}
        title={`Set-password link for ${name}`}
        description="Single use. Any earlier link for this person stops working."
      >
        {issued && (
          <div className="stack">
            <Alert tone="warning" title="Handle like a password">
              Share it only with {name}, over a channel you trust. It lets
              whoever opens it choose this account’s password. Expires{" "}
              {new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(issued.expiresAt))}{" "}
              IST.
            </Alert>
            <FormField id="invite-link" label="Link">
              <TextInput
                id="invite-link"
                readOnly
                value={issued.link}
                onFocus={(event) => event.currentTarget.select()}
                autoComplete="off"
                spellCheck={false}
              />
            </FormField>
            <div className="sheet-actions">
              <Button variant="secondary" onClick={() => close(false)}>
                Close
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(issued.link);
                    toast.success("Link copied");
                  } catch {
                    toast.error(
                      "Copy failed — select the link and copy it manually.",
                    );
                  }
                }}
              >
                <AppIcon name="clipboard" size={20} />
                Copy link
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** One role the viewer may grant, with the departments they may grant it for. */
export interface GrantOption {
  role: Role;
  /** Departments the viewer may choose from; for an organization-wide grantor, every active department. */
  departments: { id: string; name: string }[];
  /** False when the viewer's own access is department-limited, so at least one department is required. */
  orgWideAllowed: boolean;
  /** The person already holds this role: granting again replaces its departments and expiry. */
  held: boolean;
  currentDepartmentIds: string[];
}

const isScopable = (role: Role) =>
  (scopableRoles as readonly Role[]).includes(role);
const reachNote: Partial<Record<Role, string>> = {
  employee:
    "Self-service: their own attendance, leave, payslips, documents and requests.",
  manager: "Approvals and team views for their own direct reports only.",
  super_admin:
    "Every capability across the whole organization. Grant to as few people as possible.",
};

function GrantFields({
  employeeId,
  options,
  today,
  fieldError,
}: {
  employeeId: string;
  options: GrantOption[];
  today: string;
  fieldError: (name: string) => string | undefined;
}) {
  const [role, setRole] = useState<Role>(options[0]?.role ?? "employee");
  const option = options.find((item) => item.role === role) ?? options[0];
  const scopable = isScopable(role);
  const roleId = `grant-role-${employeeId}`;
  const departmentsId = `grant-departments-${employeeId}`;
  const departmentError = fieldError("departmentIds");
  const preselected = option?.held
    ? option.currentDepartmentIds
    : option && !option.orgWideAllowed && option.departments.length === 1
      ? option.departments.map((department) => department.id)
      : [];
  return (
    <>
      <input type="hidden" name="employeeId" value={employeeId} />
      <FormField id={roleId} label="Role" required error={fieldError("role")}>
        <SelectInput
          id={roleId}
          name="role"
          value={role}
          onChange={(event) => setRole(event.currentTarget.value as Role)}
          options={options.map((item) => ({
            value: item.role,
            label: item.held
              ? `${roleLabels[item.role]} (change departments or expiry)`
              : roleLabels[item.role],
          }))}
        />
      </FormField>
      {scopable && option ? (
        <fieldset
          key={`${role}-departments`}
          className="checks"
          aria-describedby={
            departmentError ? `${departmentsId}-error` : `${departmentsId}-hint`
          }
        >
          <legend>
            Departments
            {!option.orgWideAllowed && (
              <span className="required-mark" aria-hidden="true">
                {" *"}
              </span>
            )}
          </legend>
          {option.departments.map((department) => (
            <label key={department.id} className="check-row">
              <input
                type="checkbox"
                name="departmentIds"
                value={department.id}
                defaultChecked={preselected.includes(department.id)}
              />
              <span>{department.name}</span>
            </label>
          ))}
          {departmentError ? (
            <p id={`${departmentsId}-error`} className="field-error">
              {departmentError}
            </p>
          ) : (
            <p id={`${departmentsId}-hint`} className="field-hint">
              {option.orgWideAllowed
                ? "They will manage only these departments' people. Leave all unticked for organization-wide access."
                : "Choose at least one. You can grant this role only within the departments you manage."}
            </p>
          )}
        </fieldset>
      ) : (
        <p className="small muted">
          {reachNote[role] ?? "Applies organization-wide."}
        </p>
      )}
      <FormField
        id={`grant-reason-${employeeId}`}
        label="Reason"
        required
        error={fieldError("reason")}
        hint="Recorded in the audit log and shown to other administrators."
      >
        <TextArea
          id={`grant-reason-${employeeId}`}
          name="reason"
          rows={3}
          minLength={5}
          maxLength={500}
          required
          aria-invalid={Boolean(fieldError("reason"))}
          aria-describedby={describedBy(
            `grant-reason-${employeeId}`,
            fieldError("reason"),
            true,
          )}
        />
      </FormField>
      <FormField
        id={`grant-expiry-${employeeId}`}
        label="Expires on"
        error={fieldError("expiresOn")}
        hint="Optional. Access ends at the end of that day (IST). Use it for temporary cover."
      >
        <TextInput
          id={`grant-expiry-${employeeId}`}
          name="expiresOn"
          type="date"
          min={today}
          aria-invalid={Boolean(fieldError("expiresOn"))}
          aria-describedby={describedBy(
            `grant-expiry-${employeeId}`,
            fieldError("expiresOn"),
            true,
          )}
        />
      </FormField>
    </>
  );
}

/** Grants a role (optionally limited to departments) to one person. Only roles the viewer may grant are offered. */
export function GrantRoleSheet({
  employeeId,
  name,
  options,
  today,
}: {
  employeeId: string;
  name: string;
  options: GrantOption[];
  today: string;
}) {
  if (options.length === 0) return null;
  return (
    <FormSheet
      action={grantRoleAction}
      title={`Grant access to ${name}`}
      description="Applies on their next page load and is recorded in the audit log. Privileged roles stay inactive until they verify with MFA."
      trigger="Grant role"
      triggerVariant="ghost"
      triggerSize="sm"
      icon="add"
      submitLabel="Grant role"
    >
      {(fieldError) => (
        <GrantFields
          employeeId={employeeId}
          options={options}
          today={today}
          fieldError={fieldError}
        />
      )}
    </FormSheet>
  );
}

export function RevokeRoleSheet({
  employeeId,
  name,
  role,
  scopeLabel,
}: {
  employeeId: string;
  name: string;
  role: Role;
  scopeLabel: string;
}) {
  const reasonId = `revoke-reason-${employeeId}-${role}`;
  return (
    <FormSheet
      action={revokeRoleAction}
      title={`Remove ${roleLabels[role]} from ${name}`}
      description={`${roleLabels[role]} · ${scopeLabel}. Stops on their next page load.${
        role === "employee"
          ? " Without any role they can still sign in but see nothing until access is granted again."
          : ""
      }`}
      trigger={`Remove ${roleLabels[role]}`}
      triggerVariant="ghost"
      triggerSize="sm"
      submitLabel="Remove role"
      submitVariant="danger"
      pendingLabel="Removing…"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="role" value={role} />
          <FormField
            id={reasonId}
            label="Reason"
            required
            error={fieldError("reason")}
            hint="Recorded in the audit log."
          >
            <TextArea
              id={reasonId}
              name="reason"
              rows={3}
              minLength={5}
              maxLength={500}
              required
              aria-invalid={Boolean(fieldError("reason"))}
              aria-describedby={describedBy(
                reasonId,
                fieldError("reason"),
                true,
              )}
            />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function AccountStateSheet({
  employeeId,
  name,
  disabled,
}: {
  employeeId: string;
  name: string;
  disabled: boolean;
}) {
  return (
    <FormSheet
      action={setAccountDisabledAction}
      title={
        disabled ? `Enable ${name}’s account` : `Disable ${name}’s account`
      }
      description={
        disabled
          ? "They can sign in again with their existing password."
          : "Blocks sign-in immediately and stops their sessions from refreshing."
      }
      trigger={disabled ? "Enable" : "Disable"}
      triggerVariant="ghost"
      triggerSize="sm"
      submitLabel={disabled ? "Enable account" : "Disable account"}
      submitVariant={disabled ? "primary" : "danger"}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input
            type="hidden"
            name="disabled"
            value={disabled ? "false" : "true"}
          />
          <FormField
            id={`state-reason-${employeeId}`}
            label="Reason"
            required
            error={fieldError("reason")}
            hint="Recorded in the audit log."
          >
            <TextArea
              id={`state-reason-${employeeId}`}
              name="reason"
              rows={3}
              minLength={5}
              maxLength={500}
              required
              aria-invalid={Boolean(fieldError("reason"))}
              aria-describedby={describedBy(
                `state-reason-${employeeId}`,
                fieldError("reason"),
                true,
              )}
            />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
