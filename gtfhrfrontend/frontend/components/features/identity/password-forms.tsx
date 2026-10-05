"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, TextInput, describedBy } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { forgotPasswordAction, setPasswordAction } from "@/lib/actions/identity";

/**
 * Choose a password from an invite/recovery link. The token stays in hidden
 * fields and is removed from the address bar immediately; nothing is sent
 * until the person submits (link scanners can't consume it).
 */
export function SetPasswordForm({ tokenHash, type, reference, loginId, min, max }: { tokenHash: string; type: "invite" | "recovery"; reference: string; loginId: string | null; min: number; max: number }) {
  const { submit, pending, fieldError, formError } = useCommand(setPasswordAction, { toast: false });
  const [reveal, setReveal] = useState(false);
  const [length, setLength] = useState(0);
  useEffect(() => {
    window.history.replaceState(null, "", "/auth/set-password");
  }, []);
  const passwordError = fieldError("password");
  const confirmError = fieldError("confirm");
  return (
    <form onSubmit={submit} className="form" noValidate>
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="ref" value={reference} />
      {/* Lets password managers save the new password against the right login ID. */}
      {loginId && <input type="email" name="username" autoComplete="username" value={loginId} readOnly hidden />}
      <FormField id="new-password" label="New password" required error={passwordError} hint={`${min}–${max} characters. Spaces are fine — try a few unrelated words. ${length > 0 ? `${length} typed.` : ""}`}>
        <TextInput
          id="new-password"
          name="password"
          type={reveal ? "text" : "password"}
          autoComplete="new-password"
          minLength={min}
          maxLength={max}
          required
          onChange={(event) => setLength([...event.target.value].length)}
          aria-invalid={Boolean(passwordError)}
          aria-describedby={describedBy("new-password", passwordError, true)}
        />
      </FormField>
      <FormField id="confirm-password" label="Confirm password" required error={confirmError}>
        <TextInput id="confirm-password" name="confirm" type={reveal ? "text" : "password"} autoComplete="new-password" maxLength={max} required aria-invalid={Boolean(confirmError)} aria-describedby={describedBy("confirm-password", confirmError)} />
      </FormField>
      <label className="check-row">
        <input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} />
        <span>Show passwords</span>
      </label>
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <Button type="submit" className="auth-submit" pending={pending}>
        <AppIcon name="lock" size={20} />
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, submit, pending, fieldError, formError } = useCommand(forgotPasswordAction, { toast: false });
  if (state.status === "success")
    return (
      <Alert tone="success" live title="Check your email">
        {state.message}
      </Alert>
    );
  const emailError = fieldError("email");
  return (
    <form onSubmit={submit} className="form" noValidate>
      <FormField id="recovery-email" label="Work email" required error={emailError}>
        <TextInput id="recovery-email" name="email" type="email" inputMode="email" autoComplete="username" required maxLength={254} aria-invalid={Boolean(emailError)} aria-describedby={describedBy("recovery-email", emailError)} />
      </FormField>
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <Button type="submit" className="auth-submit" pending={pending}>
        <AppIcon name="send" size={20} />
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
