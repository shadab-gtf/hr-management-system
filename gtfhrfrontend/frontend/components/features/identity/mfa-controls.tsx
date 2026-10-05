"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, TextInput, describedBy } from "@/components/ui/field";
import { ConfirmButton } from "@/components/features/admin/form-sheet";
import { useCommand } from "@/hooks/use-command";
import { confirmMfaEnrollmentAction, removeMfaFactorAction, startMfaEnrollmentAction, verifyMfaAction } from "@/lib/actions/identity";

function CodeField({ id, error }: { id: string; error: string | undefined }) {
  return (
    <FormField id={id} label="6-digit code" required error={error} hint="From your authenticator app. Codes change every 30 seconds.">
      <TextInput
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, true)}
      />
    </FormField>
  );
}

/** TOTP enrollment: QR + manual key, then a first code turns the session into AAL2. */
export function MfaEnrollment({ highlight = false }: { highlight?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const { submit, pending: verifying, fieldError, formError } = useCommand(confirmMfaEnrollmentAction, { onSuccess: () => setEnrollment(null) });

  if (!enrollment)
    return (
      <div className="stack">
        {highlight && (
          <Alert tone="warning" title="Add an authenticator to use your HR or payroll access">
            Your privileged rights switch on once this session is verified with a second factor.
          </Alert>
        )}
        <div>
          <Button
            pending={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await startMfaEnrollmentAction();
                if (result.status === "error") toast.error(result.message);
                else setEnrollment({ factorId: result.factorId, qrCode: result.qrCode, secret: result.secret });
              })
            }
          >
            <AppIcon name="shield" size={20} />
            {pending ? "Starting…" : "Set up authenticator app"}
          </Button>
        </div>
      </div>
    );

  return (
    <div className="stack">
      <ol className="bullet-list">
        <li>Open an authenticator app (for example Google Authenticator, Microsoft Authenticator or 1Password).</li>
        <li>Scan the code, or enter the setup key by hand.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <Image src={enrollment.qrCode} alt="QR code for your authenticator app" width={192} height={192} unoptimized />
      <FormField id="mfa-secret" label="Setup key" hint="Only shown now. Don't share it.">
        <TextInput id="mfa-secret" readOnly type={showSecret ? "text" : "password"} value={enrollment.secret} autoComplete="off" spellCheck={false} aria-describedby="mfa-secret-hint" />
      </FormField>
      <div>
        <Button size="sm" variant="ghost" onClick={() => setShowSecret((value) => !value)} aria-pressed={showSecret}>
          <AppIcon name="eye" size={16} />
          {showSecret ? "Hide key" : "Show key"}
        </Button>
      </div>
      <form onSubmit={submit} className="form" noValidate>
        <input type="hidden" name="factorId" value={enrollment.factorId} />
        <CodeField id="mfa-enroll-code" error={fieldError("code")} />
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        <div className="sheet-actions">
          <Button variant="secondary" onClick={() => setEnrollment(null)} disabled={verifying}>
            Cancel
          </Button>
          <Button type="submit" pending={verifying}>
            {verifying ? "Verifying…" : "Verify and turn on"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function RemoveFactorButton({ factorId, disabledReason }: { factorId: string; disabledReason?: string }) {
  return <ConfirmButton label="Remove" confirmLabel="Confirm remove" run={() => removeMfaFactorAction(factorId)} {...(disabledReason ? { disabledReason } : {})} />;
}

/** Sign-in step-up (AAL1 → AAL2). */
export function MfaChallengeForm({ next }: { next: string }) {
  const { submit, pending, fieldError, formError } = useCommand(verifyMfaAction, { toast: false });
  return (
    <form onSubmit={submit} className="form" noValidate>
      <input type="hidden" name="next" value={next} />
      <CodeField id="mfa-challenge-code" error={fieldError("code")} />
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <Button type="submit" className="auth-submit" pending={pending}>
        <AppIcon name="shield" size={20} />
        {pending ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}
