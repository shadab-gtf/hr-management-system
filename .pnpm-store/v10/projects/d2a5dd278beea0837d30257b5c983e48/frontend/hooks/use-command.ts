"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";
import { toast } from "sonner";
import { idleResult, type ActionResult } from "@/types/action";

type ServerAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

function newKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Command lifecycle for one intent (state-management.md):
 * - one idempotency key per intent, reused on retry, rotated only after success;
 * - durable inline result state; Sonner toast only supplements success.
 */
export function useCommand(
  action: ServerAction,
  options: { onSuccess?: (result: Extract<ActionResult, { status: "success" }>) => void; toast?: boolean } = {},
) {
  const key = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, formData: FormData) => {
    key.current ??= newKey();
    formData.set("idempotencyKey", key.current);
    const result = await action(prev, formData);
    if (result.status === "success") {
      key.current = null;
      if (options.toast !== false)
        toast.success(result.message, {
          description: result.reference ? `Reference ${result.reference}` : undefined,
        });
      options.onSuccess?.(result);
    } else if (result.status === "error" && !result.retryable) {
      // A definitive rejection ends this intent; a corrected payload is a new one.
      key.current = null;
    }
    return result;
  }, idleResult);

  /**
   * Submit without React's automatic form reset, so entered values survive a
   * validation error. The clicked submitter's name/value is preserved.
   */
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter instanceof HTMLElement ? submitter : null);
    startTransition(() => formAction(formData));
  };

  /** Programmatic dispatch (e.g. after collecting device data such as location). */
  const dispatch = (formData: FormData) => startTransition(() => formAction(formData));

  const fieldError = (name: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[name] : undefined;
  const formError =
    state.status === "error" && Object.keys(state.fieldErrors ?? {}).length === 0 ? state.message : undefined;

  return { state, submit, dispatch, pending, fieldError, formError };
}
