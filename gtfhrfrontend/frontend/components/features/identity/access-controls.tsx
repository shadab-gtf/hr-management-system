"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { copyInviteLinkAction, grantRoleAction, inviteAccountAction, revokeRoleAction, setAccountDisabledAction } from "@/lib/actions/identity";
import { roleLabels } from "@/types/identity";
import type { Role } from "@/types/session";

/** Sends (or re-sends) the welcome mail: login ID + single-use set-password link. */
export function InviteAccountButton({ employeeId, resend }: { employeeId: string; resend: boolean }) {
  const { submit, pending, formError } = useCommand(inviteAccountAction);
  return (
    <form onSubmit={submit} className="cluster">
      <input type="hidden" name="employeeId" value={employeeId} />
      <Button type="submit" size="sm" variant={resend ? "ghost" : "secondary"} pending={pending}>
        <AppIcon name="mail" size={16} />
        {pending ? "Sending…" : resend ? "Resend invite" : "Send invite"}
      </Button>
      {formError && <span className="small text-danger" role="alert">{formError}</span>}
    </form>
  );
}

/** Issues a fresh single-use link for HR to hand over when mail isn't delivered. */
export function CopyInviteLinkButton({ employeeId, name }: { employeeId: string; name: string }) {
  const sheet = useDisclosure();
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<{ link: string; expiresAt: string } | null>(null);
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
      <Sheet open={sheet.open} onOpenChange={close} title={`Set-password link for ${name}`} description="Single use. Any earlier link for this person stops working.">
        {issued && (
          <div className="stack">
            <Alert tone="warning" title="Handle like a password">
              Share it only with {name}, over a channel you trust. It lets whoever opens it choose this account’s password. Expires{" "}
              {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(issued.expiresAt))} IST.
            </Alert>
            <FormField id="invite-link" label="Link">
              <TextInput id="invite-link" readOnly value={issued.link} onFocus={(event) => event.currentTarget.select()} autoComplete="off" spellCheck={false} />
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
                    toast.error("Copy failed — select the link and copy it manually.");
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

export function GrantRoleSheet({ employeeId, name, roles, today }: { employeeId: string; name: string; roles: Role[]; today: string }) {
  if (roles.length === 0) return null;
  return (
    <FormSheet action={grantRoleAction} title={`Grant a role to ${name}`} description="Privileged roles need a reason and take effect only after the person verifies with MFA." trigger="Grant role" triggerVariant="ghost" triggerSize="sm" icon="add" submitLabel="Grant role">
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employeeId} />
          <FormField id={`grant-role-${employeeId}`} label="Role" required error={fieldError("role")}>
            <SelectInput id={`grant-role-${employeeId}`} name="role" options={roles.map((role) => ({ value: role, label: roleLabels[role] }))} />
          </FormField>
          <FormField id={`grant-reason-${employeeId}`} label="Reason" error={fieldError("reason")} hint="Required for HR and payroll roles. Recorded in the audit log.">
            <TextArea id={`grant-reason-${employeeId}`} name="reason" rows={3} maxLength={500} aria-invalid={Boolean(fieldError("reason"))} aria-describedby={describedBy(`grant-reason-${employeeId}`, fieldError("reason"), true)} />
          </FormField>
          <FormField id={`grant-expiry-${employeeId}`} label="Expires on" error={fieldError("expiresOn")} hint="Optional, at most a year. Access ends at the end of that day (IST).">
            <TextInput id={`grant-expiry-${employeeId}`} name="expiresOn" type="date" min={today} aria-invalid={Boolean(fieldError("expiresOn"))} aria-describedby={describedBy(`grant-expiry-${employeeId}`, fieldError("expiresOn"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RevokeRoleSheet({ employeeId, name, role }: { employeeId: string; name: string; role: Role }) {
  return (
    <FormSheet action={revokeRoleAction} title={`Remove ${roleLabels[role]} from ${name}`} description="Takes effect on their next request." trigger={`Remove ${roleLabels[role]}`} triggerVariant="ghost" triggerSize="sm" submitLabel="Remove role" submitVariant="danger" pendingLabel="Removing…">
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="role" value={role} />
          <FormField id={`revoke-reason-${employeeId}-${role}`} label="Reason" error={fieldError("reason")} hint="Required for HR and payroll roles.">
            <TextArea id={`revoke-reason-${employeeId}-${role}`} name="reason" rows={3} maxLength={500} aria-invalid={Boolean(fieldError("reason"))} aria-describedby={describedBy(`revoke-reason-${employeeId}-${role}`, fieldError("reason"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function AccountStateSheet({ employeeId, name, disabled }: { employeeId: string; name: string; disabled: boolean }) {
  return (
    <FormSheet
      action={setAccountDisabledAction}
      title={disabled ? `Enable ${name}’s account` : `Disable ${name}’s account`}
      description={disabled ? "They can sign in again with their existing password." : "Blocks sign-in immediately and stops their sessions from refreshing."}
      trigger={disabled ? "Enable" : "Disable"}
      triggerVariant="ghost"
      triggerSize="sm"
      submitLabel={disabled ? "Enable account" : "Disable account"}
      submitVariant={disabled ? "primary" : "danger"}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
          <FormField id={`state-reason-${employeeId}`} label="Reason" required={!disabled} error={fieldError("reason")} hint="Recorded in the audit log.">
            <TextArea id={`state-reason-${employeeId}`} name="reason" rows={3} maxLength={500} aria-invalid={Boolean(fieldError("reason"))} aria-describedby={describedBy(`state-reason-${employeeId}`, fieldError("reason"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
